const express = require('express');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Booking = require('../models/Booking');
const { authenticateToken } = require('../middleware/auth');
const { generateReceiptNumber } = require('../utils/helpers');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();

function isValidHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getClientUrl(req) {
  const candidates = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    req.headers.origin,
    'http://localhost:5173',
  ];

  const resolved = candidates.find(isValidHttpUrl) || 'http://localhost:5173';
  return resolved.replace(/\/$/, '');
}

function getStripeImageUrl(rawUrl) {
  if (!rawUrl) return null;
  if (isValidHttpUrl(rawUrl)) return rawUrl;

  if (rawUrl.startsWith('/') && isValidHttpUrl(process.env.PUBLIC_BASE_URL)) {
    return `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}${rawUrl}`;
  }

  return null;
}

// Process payment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { order_id, booking_id, amount, payment_method, payment_type, reference_number, installment_number, total_installments, notes } = req.body;

    if (!amount || !payment_method) return res.status(400).json({ error: 'Amount and payment method required.' });
    if (!order_id && !booking_id) return res.status(400).json({ error: 'Order or booking ID required.' });

    if (order_id) {
      const order = await Order.findOne({ _id: order_id, user_id: req.user.id });
      if (!order) return res.status(404).json({ error: 'Order not found.' });
    }
    if (booking_id) {
      const booking = await Booking.findOne({ _id: booking_id, user_id: req.user.id });
      if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    }

    const payment = await Payment.create({
      order_id: order_id || null,
      booking_id: booking_id || null,
      user_id: req.user.id,
      amount,
      payment_method,
      payment_type: payment_type || 'full',
      reference_number: reference_number || null,
      status: 'completed',
      receipt_number: generateReceiptNumber(),
      installment_number: installment_number || null,
      total_installments: total_installments || null,
      notes: notes || null,
    });

    // Update order status for non-reservation direct payments
    if (order_id && payment_type !== 'installment' && payment_type !== 'reservation') {
      await Order.findByIdAndUpdate(order_id, { status: 'confirmed' });
    }

    // Mark order reservation fee paid
    if (order_id && payment_type === 'reservation') {
      await Order.findByIdAndUpdate(order_id, { reservation_fee_paid: true, status: 'confirmed' });
    }

    // Mark reservation fee as paid for booking payments
    if (booking_id && payment_type === 'reservation') {
      await Booking.findByIdAndUpdate(booking_id, { reservation_fee_paid: true });
    }

    res.status(201).json({ ...payment.toObject(), id: payment._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error processing payment.' });
  }
});

// Get receipt
router.get('/receipt/:receiptNumber', authenticateToken, async (req, res) => {
  try {
    const payment = await Payment.findOne({ receipt_number: req.params.receiptNumber, user_id: req.user.id })
      .populate('order_id')
      .populate('booking_id')
      .lean();
    if (!payment) return res.status(404).json({ error: 'Receipt not found.' });
    payment.id = payment._id;
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get user payments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const payments = await Payment.find({ user_id: req.user.id })
      .populate('order_id', 'order_number total_amount status')
      .populate('booking_id', 'booking_number booking_type status')
      .sort({ created_at: -1 })
      .lean();
    res.json(payments.map(p => ({ ...p, id: p._id })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create Stripe Checkout Session for an order
router.post('/stripe/create-session', authenticateToken, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured on the server.' });
    }

    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Order ID is required.' });

    const order = await Order.findOne({ _id: order_id, user_id: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const items = await OrderItem.find({ order_id: order._id }).populate('product_id', 'name image_url').lean();
    if (!items.length) return res.status(400).json({ error: 'Order has no items to pay for.' });

    if (!Number.isFinite(order.total_amount) || order.total_amount <= 0) {
      return res.status(400).json({ error: 'Invalid order total for online payment.' });
    }

    for (const item of items) {
      if (!Number.isFinite(item.unit_price) || item.unit_price <= 0 || !Number.isFinite(item.quantity) || item.quantity <= 0) {
        return res.status(400).json({ error: 'Order contains invalid line item amounts for Stripe payment.' });
      }
    }

    const line_items = items.map(item => {
      const imageUrl = getStripeImageUrl(item.product_id?.image_url);
      return {
        price_data: {
          currency: 'php',
          product_data: {
            name: item.product_id?.name || 'Product',
            ...(imageUrl ? { images: [imageUrl] } : {}),
          },
          unit_amount: Math.round(item.unit_price * 100),
        },
        quantity: item.quantity,
      };
    });

    const clientUrl = getClientUrl(req);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/orders/${order._id}`,
      metadata: {
        order_id: order._id.toString(),
        user_id: req.user.id.toString(),
        order_number: order.order_number,
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe session error:', err.message);
    res.status(500).json({ error: 'Failed to create payment session.' });
  }
});

// Verify Stripe payment and record it
router.post('/stripe/verify', authenticateToken, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured on the server.' });
    }

    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Session ID is required.' });

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed.' });
    }

    if (!Number.isFinite(session.amount_total) || session.amount_total <= 0) {
      return res.status(400).json({ error: 'Invalid paid amount from payment session.' });
    }

    // Check if already recorded
    const existing = await Payment.findOne({ reference_number: session.id });
    if (existing) {
      return res.json({ ...existing.toObject(), id: existing._id, already_recorded: true });
    }

    const orderId = session.metadata.order_id;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const amount = session.amount_total / 100;

    const payment = await Payment.create({
      order_id: orderId,
      user_id: req.user.id,
      amount,
      payment_method: 'credit_card',
      payment_type: 'full',
      reference_number: session.id,
      status: 'completed',
      receipt_number: generateReceiptNumber(),
    });

    // Update order status
    await Order.findByIdAndUpdate(orderId, { status: 'confirmed' });

    res.json({ ...payment.toObject(), id: payment._id });
  } catch (err) {
    console.error('Stripe verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

// Get Stripe publishable key
router.get('/stripe/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// Create Stripe Checkout Session for a booking reservation fee
router.post('/stripe/create-reservation-session', authenticateToken, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured on the server.' });
    }

    const { booking_id } = req.body;
    if (!booking_id) return res.status(400).json({ error: 'Booking ID is required.' });

    const booking = await Booking.findOne({ _id: booking_id, user_id: req.user.id }).populate('product_id', 'name image_url');
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (booking.reservation_fee_paid) return res.status(400).json({ error: 'Reservation fee already paid.' });
    if (!booking.reservation_fee || booking.reservation_fee <= 0) return res.status(400).json({ error: 'No reservation fee for this booking.' });

    const clientUrl = getClientUrl(req);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'php',
          product_data: {
            name: `Reservation Fee — ${booking.product_id?.name || 'Vehicle'}`,
            description: `Booking ${booking.booking_number} • SR-5 Trading Corporation`,
          },
          unit_amount: Math.round(booking.reservation_fee * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=reservation`,
      cancel_url: `${clientUrl}/bookings`,
      metadata: {
        booking_id: booking._id.toString(),
        user_id: req.user.id.toString(),
        booking_number: booking.booking_number,
        payment_type: 'reservation',
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe reservation session error:', err.message);
    res.status(500).json({ error: 'Failed to create payment session.' });
  }
});

// Verify Stripe reservation fee payment and mark booking as paid
router.post('/stripe/verify-reservation', authenticateToken, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured on the server.' });
    }

    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Session ID is required.' });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Payment not completed.' });
    if (!Number.isFinite(session.amount_total) || session.amount_total <= 0) {
      return res.status(400).json({ error: 'Invalid paid amount from payment session.' });
    }

    const existing = await Payment.findOne({ reference_number: session.id });
    if (existing) return res.json({ ...existing.toObject(), id: existing._id, already_recorded: true });

    const bookingId = session.metadata.booking_id;
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    const amount = session.amount_total / 100;

    const payment = await Payment.create({
      booking_id: bookingId,
      user_id: req.user.id,
      amount,
      payment_method: 'credit_card',
      payment_type: 'reservation',
      reference_number: session.id,
      status: 'completed',
      receipt_number: generateReceiptNumber(),
    });

    await Booking.findByIdAndUpdate(bookingId, { reservation_fee_paid: true });

    res.json({ ...payment.toObject(), id: payment._id, booking_id: bookingId });
  } catch (err) {
    console.error('Stripe reservation verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

// Create Stripe Checkout Session for an order reservation fee (vehicle orders)
router.post('/stripe/create-order-reservation-session', authenticateToken, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured on the server.' });
    }

    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Order ID is required.' });

    const order = await Order.findOne({ _id: order_id, user_id: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!order.has_vehicle || !order.reservation_fee_total || order.reservation_fee_total <= 0) {
      return res.status(400).json({ error: 'This order has no vehicle reservation fee.' });
    }

    if (!Number.isFinite(order.reservation_fee_total) || order.reservation_fee_total <= 0) {
      return res.status(400).json({ error: 'Invalid reservation fee amount for Stripe payment.' });
    }

    if (order.reservation_fee_paid) return res.status(400).json({ error: 'Reservation fee already paid.' });

    const clientUrl = getClientUrl(req);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'php',
          product_data: {
            name: `Vehicle Reservation Fee — ${order.order_number}`,
            description: `Secure your reserved vehicle order at SR-5 Trading Corporation`,
          },
          unit_amount: Math.round(order.reservation_fee_total * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=order_reservation`,
      cancel_url: `${clientUrl}/orders/${order._id}`,
      metadata: {
        order_id: order._id.toString(),
        user_id: req.user.id.toString(),
        order_number: order.order_number,
        payment_type: 'order_reservation',
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe order reservation session error:', err.message);
    res.status(500).json({ error: 'Failed to create payment session.' });
  }
});

// Verify Stripe order reservation fee payment and mark order as reserved-paid
router.post('/stripe/verify-order-reservation', authenticateToken, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured on the server.' });
    }

    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Session ID is required.' });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Payment not completed.' });
    if (!Number.isFinite(session.amount_total) || session.amount_total <= 0) {
      return res.status(400).json({ error: 'Invalid paid amount from payment session.' });
    }

    const existing = await Payment.findOne({ reference_number: session.id });
    if (existing) return res.json({ ...existing.toObject(), id: existing._id, already_recorded: true });

    const orderId = session.metadata.order_id;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const amount = session.amount_total / 100;

    const payment = await Payment.create({
      order_id: orderId,
      user_id: req.user.id,
      amount,
      payment_method: 'credit_card',
      payment_type: 'reservation',
      reference_number: session.id,
      status: 'completed',
      receipt_number: generateReceiptNumber(),
    });

    await Order.findByIdAndUpdate(orderId, { reservation_fee_paid: true, status: 'confirmed' });

    res.json({ ...payment.toObject(), id: payment._id, order_id: orderId });
  } catch (err) {
    console.error('Stripe order reservation verify error:', err.message);
    res.status(500).json({ error: 'Failed to verify payment.' });
  }
});

module.exports = router;
