const express = require('express');
const { randomUUID, createHmac, timingSafeEqual } = require('crypto');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Booking = require('../models/Booking');
const InstallmentPlan = require('../models/InstallmentPlan');
const InstallmentSchedule = require('../models/InstallmentSchedule');
const { authenticateToken } = require('../middleware/auth');
const { generateReceiptNumber } = require('../utils/helpers');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const router = express.Router();
const PAYMONGO_API_BASE_URL = (process.env.PAYMONGO_API_BASE_URL || 'https://api.paymongo.com/v1').replace(/\/$/, '');
const PAYMONGO_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;
const paymongoCheckoutContextBySession = new Map();
const paymongoCheckoutContextByReference = new Map();

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

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getUniqueCompletedPaymentTotal(payments = []) {
  const seenRefs = new Set();
  let total = 0;

  for (const payment of payments) {
    if (payment.status !== 'completed') continue;

    const reference = payment.reference_number ? String(payment.reference_number) : null;
    if (reference) {
      if (seenRefs.has(reference)) continue;
      seenRefs.add(reference);
    }

    total += Number(payment.amount || 0);
  }

  return total;
}

function toCentavos(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function fromCentavos(amount) {
  return roundCurrency(Number(amount || 0) / 100);
}

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function assertPaymongoConfigured() {
  const key = String(process.env.PAYMONGO_SECRET_KEY || '').trim();
  if (!key) {
    throw createHttpError(503, 'PayMongo is not configured on the server.');
  }
  return key;
}

function getPaymongoAuthHeader() {
  const key = assertPaymongoConfigured();
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

function parsePaymongoErrorBody(body) {
  if (!body) return null;
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors[0]?.detail || body.errors[0]?.title || body.errors[0]?.code || null;
  }
  return body.error || body.message || null;
}

async function paymongoRequest(path, options = {}) {
  const { method = 'GET', body } = options;
  const response = await fetch(`${PAYMONGO_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: getPaymongoAuthHeader(),
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsePaymongoErrorBody(parsed) || `PayMongo request failed with status ${response.status}.`;
    throw createHttpError(response.status, message);
  }

  return parsed;
}

function cleanupExpiredPaymongoContexts() {
  const now = Date.now();
  for (const [sessionId, context] of paymongoCheckoutContextBySession.entries()) {
    if (Number(context.expiresAtMs || 0) <= now) {
      paymongoCheckoutContextBySession.delete(sessionId);
    }
  }

  for (const [referenceKey, context] of paymongoCheckoutContextByReference.entries()) {
    if (Number(context.expiresAtMs || 0) <= now) {
      paymongoCheckoutContextByReference.delete(referenceKey);
    }
  }
}

function storePaymongoCheckoutContext(context) {
  cleanupExpiredPaymongoContexts();

  paymongoCheckoutContextBySession.set(context.sessionId, context);
  if (context.checkoutReference) {
    paymongoCheckoutContextByReference.set(context.checkoutReference, context);
  }
}

function getPaymongoCheckoutContextBySession(sessionId) {
  cleanupExpiredPaymongoContexts();
  return paymongoCheckoutContextBySession.get(sessionId) || null;
}

function getPaymongoCheckoutContextByReference(checkoutReference) {
  cleanupExpiredPaymongoContexts();
  if (!checkoutReference) return null;
  return paymongoCheckoutContextByReference.get(checkoutReference) || null;
}

function clearPaymongoCheckoutContext(sessionId, checkoutReference = null) {
  if (sessionId) {
    const existing = paymongoCheckoutContextBySession.get(sessionId);
    if (existing?.checkoutReference) {
      paymongoCheckoutContextByReference.delete(existing.checkoutReference);
    }
    paymongoCheckoutContextBySession.delete(sessionId);
  }

  if (checkoutReference) {
    const existing = paymongoCheckoutContextByReference.get(checkoutReference);
    if (existing?.sessionId) {
      paymongoCheckoutContextBySession.delete(existing.sessionId);
    }
    paymongoCheckoutContextByReference.delete(checkoutReference);
  }
}

function normalizePaymongoCheckoutResource(payload) {
  if (!payload) return null;

  if (payload.id && payload.type === 'checkout_session') {
    return payload;
  }

  if (payload.data?.id && payload.data?.type === 'checkout_session') {
    return payload.data;
  }

  if (payload.data?.attributes?.data?.id && payload.data?.attributes?.data?.type === 'checkout_session') {
    return payload.data.attributes.data;
  }

  return null;
}

function extractPaymongoCheckoutDetails(checkoutResource) {
  const attrs = checkoutResource?.attributes || {};
  const payments = Array.isArray(attrs.payments) ? attrs.payments : [];
  const paidPayment = payments.find((payment) => {
    const status = String(payment?.attributes?.status || '').toLowerCase();
    return status === 'paid' || status === 'succeeded';
  });

  const lineItems = Array.isArray(attrs.line_items) ? attrs.line_items : [];
  const fallbackLineItemsCentavos = lineItems.reduce((sum, item) => {
    const amount = Number(item?.amount || 0);
    const quantity = Number(item?.quantity || 1);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + (amount * (Number.isFinite(quantity) && quantity > 0 ? quantity : 1));
  }, 0);

  const paymentAmountCentavos = Number(paidPayment?.attributes?.amount || 0);
  const amountPaid = fromCentavos(paymentAmountCentavos > 0 ? paymentAmountCentavos : fallbackLineItemsCentavos);

  return {
    sessionId: checkoutResource?.id || null,
    metadata: attrs.metadata || {},
    paymentMethodUsed: attrs.payment_method_used || null,
    paid: Boolean(attrs.paid_at) || Boolean(paidPayment),
    amountPaid,
  };
}

function parsePaymongoSignatureHeader(headerValue) {
  const parts = String(headerValue || '')
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [key, value] = part.split('=');
      if (key && value) acc[key] = value;
      return acc;
    }, {});

  return {
    timestamp: parts.t || null,
    testSignature: parts.te || null,
    liveSignature: parts.li || null,
  };
}

function secureCompareHex(expectedHex, actualHex) {
  try {
    const expected = Buffer.from(String(expectedHex || ''), 'hex');
    const actual = Buffer.from(String(actualHex || ''), 'hex');
    if (expected.length === 0 || actual.length === 0 || expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function verifyPaymongoWebhookSignature({ headerValue, rawBody, livemode }) {
  const webhookSecret = String(process.env.PAYMONGO_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) return true;

  const parsed = parsePaymongoSignatureHeader(headerValue);
  if (!parsed.timestamp) return false;

  const signatureToCompare = livemode ? parsed.liveSignature : parsed.testSignature;
  if (!signatureToCompare) return false;

  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
  return secureCompareHex(expected, signatureToCompare);
}

async function createPaymongoCheckoutSession({
  req,
  userId,
  type,
  amount,
  cancelPath,
  lineItemName,
  lineItemDescription,
  metadata = {},
}) {
  const normalizedAmount = roundCurrency(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw createHttpError(400, 'Invalid amount for PayMongo checkout session.');
  }

  const clientUrl = getClientUrl(req);
  const checkoutReference = `pmref_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const successUrl = `${clientUrl}/payment/success?provider=paymongo&type=${encodeURIComponent(type)}&checkout_ref=${encodeURIComponent(checkoutReference)}`;
  const cancelUrl = `${clientUrl}${cancelPath.startsWith('/') ? cancelPath : `/${cancelPath}`}`;

  const payload = {
    data: {
      attributes: {
        billing_information_fields_editable: 'enabled',
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        line_items: [
          {
            currency: 'PHP',
            amount: toCentavos(normalizedAmount),
            name: lineItemName,
            quantity: 1,
            ...(lineItemDescription ? { description: lineItemDescription } : {}),
          },
        ],
        payment_method_types: ['gcash'],
        success_url: successUrl,
        cancel_url: cancelUrl,
        ...(lineItemDescription ? { description: lineItemDescription } : {}),
        metadata: {
          flow_type: type,
          user_id: String(userId),
          checkout_reference: checkoutReference,
          ...metadata,
        },
      },
    },
  };

  const response = await paymongoRequest('/checkout_sessions', {
    method: 'POST',
    body: payload,
  });

  const checkoutResource = normalizePaymongoCheckoutResource(response);
  if (!checkoutResource?.id || !checkoutResource?.attributes?.checkout_url) {
    throw createHttpError(502, 'Invalid response while creating PayMongo checkout session.');
  }

  const expiresAtMs = Date.now() + PAYMONGO_CONTEXT_TTL_MS;
  const context = {
    sessionId: checkoutResource.id,
    checkoutReference,
    userId: String(userId),
    type,
    amount: normalizedAmount,
    metadata,
    expiresAtMs,
  };
  storePaymongoCheckoutContext(context);

  return {
    sessionId: checkoutResource.id,
    checkout_reference: checkoutReference,
    provider: 'paymongo',
    url: checkoutResource.attributes.checkout_url,
    cancel_url: cancelUrl,
    success_url: successUrl,
    expires_at: new Date(expiresAtMs).toISOString(),
  };
}

function getValidatedPaymongoCheckoutContext({ sessionId = null, checkoutReference = null, userId = null }) {
  const context = sessionId
    ? getPaymongoCheckoutContextBySession(sessionId)
    : getPaymongoCheckoutContextByReference(checkoutReference);

  if (!context) {
    return null;
  }

  if (userId && String(context.userId) !== String(userId)) {
    throw createHttpError(403, 'PayMongo checkout session does not belong to this user.');
  }

  return context;
}

function rememberResolvedPaymongoSession(context, sessionId) {
  if (!context || !sessionId) return;
  if (context.sessionId === sessionId) return;

  const merged = {
    ...context,
    sessionId,
    expiresAtMs: Date.now() + PAYMONGO_CONTEXT_TTL_MS,
  };
  storePaymongoCheckoutContext(merged);
}

function isInstallmentPayableStatus(status) {
  return ['pending', 'active', 'defaulted'].includes(status);
}

async function markOverdueScheduleRows(installmentPlanId, session = null) {
  await InstallmentSchedule.updateMany(
    {
      installment_plan_id: installmentPlanId,
      status: { $in: ['pending', 'partially_paid'] },
      due_date: { $lt: new Date() },
    },
    { status: 'overdue' },
    session ? { session } : undefined
  );
}

async function applyInstallmentOnlinePayment({
  planId,
  installmentNumber,
  amount,
  referenceNumber,
  userId,
  paymentMethod = 'credit_card',
  session,
}) {
  const plan = await InstallmentPlan.findById(planId).session(session);
  if (!plan) {
    const err = new Error('Installment plan not found.');
    err.status = 404;
    throw err;
  }

  if (!plan.down_payment_paid) {
    const err = new Error('Down payment must be paid before monthly online payments.');
    err.status = 400;
    throw err;
  }

  if (!['credit_card', 'debit_card', 'gcash'].includes(paymentMethod)) {
    const err = new Error('Unsupported online payment method for installment.');
    err.status = 400;
    throw err;
  }

  if (!isInstallmentPayableStatus(plan.status)) {
    const err = new Error(`Cannot record payment for plan status ${plan.status}.`);
    err.status = 400;
    throw err;
  }

  await markOverdueScheduleRows(plan._id, session);

  const firstUnpaid = await InstallmentSchedule.findOne({
    installment_plan_id: plan._id,
    status: { $ne: 'paid' },
  }).session(session).sort({ installment_number: 1 });

  if (!firstUnpaid) {
    const err = new Error('All installments are already paid.');
    err.status = 400;
    throw err;
  }

  if (installmentNumber !== firstUnpaid.installment_number) {
    const err = new Error(`Installments must be paid in order. Next payable installment is #${firstUnpaid.installment_number}.`);
    err.status = 400;
    throw err;
  }

  const row = await InstallmentSchedule.findOne({
    installment_plan_id: plan._id,
    installment_number: installmentNumber,
  }).session(session);

  if (!row) {
    const err = new Error('Installment schedule row not found.');
    err.status = 404;
    throw err;
  }

  if (row.status === 'paid') {
    const err = new Error('This installment is already paid.');
    err.status = 400;
    throw err;
  }

  const amountToApply = roundCurrency(amount);
  const dueLeft = roundCurrency((row.amount_due || 0) - (row.amount_paid || 0));
  if (amountToApply <= 0) {
    const err = new Error('Invalid installment amount.');
    err.status = 400;
    throw err;
  }
  if (amountToApply > dueLeft) {
    const err = new Error(`Amount exceeds remaining due for installment #${installmentNumber}.`);
    err.status = 400;
    throw err;
  }

  const duplicatePayment = await Payment.findOne({
    order_id: plan.order_id,
    payment_type: 'installment',
    reference_number: referenceNumber,
    status: 'completed',
  }).session(session);

  if (duplicatePayment) {
    return {
      payment: duplicatePayment,
      schedule: row,
      plan,
      alreadyRecorded: true,
    };
  }

  const updatedAmountPaid = roundCurrency((row.amount_paid || 0) + amountToApply);
  if (updatedAmountPaid >= roundCurrency(row.amount_due)) {
    row.amount_paid = roundCurrency(row.amount_due);
    row.status = 'paid';
    row.paid_date = new Date();
  } else {
    row.amount_paid = updatedAmountPaid;
    row.status = row.due_date < new Date() ? 'overdue' : 'partially_paid';
  }
  await row.save({ session });

  const [payment] = await Payment.create([{
    order_id: plan.order_id,
    user_id: userId,
    amount: amountToApply,
    payment_method: paymentMethod,
    payment_type: 'installment',
    reference_number: referenceNumber,
    status: 'completed',
    receipt_number: generateReceiptNumber(),
    installment_number: row.installment_number,
    total_installments: plan.number_of_installments,
  }], { session });

  const remainingRows = await InstallmentSchedule.countDocuments({
    installment_plan_id: plan._id,
    status: { $ne: 'paid' },
  }).session(session);

  const order = await Order.findById(plan.order_id).session(session);
  if (!order) {
    const err = new Error('Order not found.');
    err.status = 404;
    throw err;
  }

  if (remainingRows === 0) {
    plan.status = 'completed';
    order.status = 'completed';
  } else {
    plan.status = 'active';
    order.status = 'installment_active';
  }
  order.payment_method = 'installment';

  await plan.save({ session });
  await order.save({ session });

  return {
    payment,
    schedule: row,
    plan,
    alreadyRecorded: false,
  };
}

// Process payment
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { order_id, booking_id, amount, payment_method, payment_type, reference_number, installment_number, total_installments, notes } = req.body;

    if (!amount || !payment_method) return res.status(400).json({ error: 'Amount and payment method required.' });
    if (!order_id && !booking_id) return res.status(400).json({ error: 'Order or booking ID required.' });

    let order = null;
    if (order_id) {
      order = await Order.findOne({ _id: order_id, user_id: req.user.id });
      if (!order) return res.status(404).json({ error: 'Order not found.' });
    }
    if (booking_id) {
      const booking = await Booking.findOne({ _id: booking_id, user_id: req.user.id });
      if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    }

    const normalizedPaymentMethod = String(payment_method || '').trim();
    const normalizedPaymentType = String(payment_type || 'full').trim();

    if (order?.has_vehicle && ['credit_card', 'debit_card', 'gcash'].includes(normalizedPaymentMethod) && normalizedPaymentType !== 'installment') {
      return res.status(400).json({
        error: 'For vehicle orders, card and GCash are only available for monthly installment payments.',
      });
    }

    const payment = await Payment.create({
      order_id: order_id || null,
      booking_id: booking_id || null,
      user_id: req.user.id,
      amount,
      payment_method: normalizedPaymentMethod,
      payment_type: normalizedPaymentType,
      reference_number: reference_number || null,
      status: 'completed',
      receipt_number: generateReceiptNumber(),
      installment_number: installment_number || null,
      total_installments: total_installments || null,
      notes: notes || null,
    });

    // Update order status for non-reservation direct payments
    if (order_id && normalizedPaymentType !== 'installment' && normalizedPaymentType !== 'reservation') {
      await Order.findByIdAndUpdate(order_id, { status: 'confirmed' });
    }

    // Mark order reservation fee paid
    if (order_id && normalizedPaymentType === 'reservation') {
      await Order.findByIdAndUpdate(order_id, { reservation_fee_paid: true, status: 'confirmed' });
    }

    // Mark reservation fee as paid for booking payments
    if (booking_id && normalizedPaymentType === 'reservation') {
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

// Create PayMongo Checkout Session for GCash order payment
router.post('/gcash/create-session', authenticateToken, async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Order ID is required.' });

    const order = await Order.findOne({ _id: order_id, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.payment_method === 'installment') {
      return res.status(400).json({ error: 'Use the installment payment flow for installment orders.' });
    }

    const completedPayments = await Payment.find({ order_id: order._id, status: 'completed' }).lean();
    const totalPaid = getUniqueCompletedPaymentTotal(completedPayments);
    const remainingBalance = roundCurrency(Math.max(0, Number(order.total_amount || 0) - totalPaid));

    if (remainingBalance <= 0) {
      return res.status(400).json({ error: 'This order has no remaining balance to pay.' });
    }

    const session = await createPaymongoCheckoutSession({
      req,
      userId: req.user.id,
      amount: remainingBalance,
      type: 'order',
      cancelPath: `/orders/${order._id}`,
      lineItemName: `Order Payment — ${order.order_number}`,
      lineItemDescription: 'GCash checkout payment for SR-5 order balance.',
      metadata: {
        order_id: order._id.toString(),
        order_number: order.order_number,
      },
    });

    return res.json({
      ...session,
      amount_due: remainingBalance,
    });
  } catch (err) {
    console.error('GCash create session error:', err.message);
    return res.status(500).json({ error: 'Failed to create GCash payment session.' });
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
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Order ID is required.' });

    const order = await Order.findOne({ _id: order_id, user_id: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!order.has_vehicle || !order.reservation_fee_total || order.reservation_fee_total <= 0) {
      return res.status(400).json({ error: 'This order has no vehicle reservation fee.' });
    }
    if (order.reservation_fee_paid) {
      return res.status(400).json({ error: 'Reservation fee already paid.' });
    }

    return res.status(403).json({
      error: 'Online card and GCash are unavailable for vehicle reservation fees. Please coordinate payment with admin/store.',
    });
  } catch (err) {
    console.error('Stripe order reservation session error:', err.message);
    res.status(500).json({ error: 'Failed to create payment session.' });
  }
});

// Create PayMongo Checkout Session for GCash order reservation fee
router.post('/gcash/create-order-reservation-session', authenticateToken, async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Order ID is required.' });

    const order = await Order.findOne({ _id: order_id, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!order.has_vehicle || !order.reservation_fee_total || order.reservation_fee_total <= 0) {
      return res.status(400).json({ error: 'This order has no vehicle reservation fee.' });
    }
    if (order.reservation_fee_paid) {
      return res.status(400).json({ error: 'Reservation fee already paid.' });
    }

    return res.status(403).json({
      error: 'Online card and GCash are unavailable for vehicle reservation fees. Please coordinate payment with admin/store.',
    });
  } catch (err) {
    console.error('GCash order reservation session error:', err.message);
    return res.status(500).json({ error: 'Failed to create GCash reservation session.' });
  }
});

// Create Stripe Checkout Session for next monthly installment payment
router.post('/stripe/create-installment-session', authenticateToken, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured on the server.' });
    }

    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Order ID is required.' });

    const order = await Order.findOne({ _id: order_id, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.payment_method !== 'installment') {
      return res.status(400).json({ error: 'This order is not using installment payment.' });
    }

    const plan = await InstallmentPlan.findOne({ order_id: order._id }).lean();
    if (!plan) return res.status(404).json({ error: 'Installment plan not found.' });
    if (!plan.down_payment_paid) {
      return res.status(400).json({ error: 'Down payment must be paid before monthly installment payment.' });
    }
    if (!isInstallmentPayableStatus(plan.status)) {
      return res.status(400).json({ error: `Cannot pay for installment plan status ${plan.status}.` });
    }

    await markOverdueScheduleRows(plan._id);

    const nextRow = await InstallmentSchedule.findOne({
      installment_plan_id: plan._id,
      status: { $ne: 'paid' },
    }).sort({ installment_number: 1 }).lean();

    if (!nextRow) {
      return res.status(400).json({ error: 'All installments are already paid.' });
    }

    const dueLeft = roundCurrency((nextRow.amount_due || 0) - (nextRow.amount_paid || 0));
    if (dueLeft <= 0) {
      return res.status(400).json({ error: 'No payable balance left for the next installment.' });
    }

    const clientUrl = getClientUrl(req);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'php',
          product_data: {
            name: `Installment #${nextRow.installment_number} — ${order.order_number}`,
            description: `Monthly installment payment for your vehicle order at SR-5 Trading Corporation`,
          },
          unit_amount: Math.round(dueLeft * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&type=installment`,
      cancel_url: `${clientUrl}/orders/${order._id}`,
      metadata: {
        payment_type: 'installment',
        order_id: order._id.toString(),
        installment_plan_id: plan._id.toString(),
        installment_number: String(nextRow.installment_number),
        user_id: req.user.id.toString(),
      },
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      installment_number: nextRow.installment_number,
      amount_due: dueLeft,
    });
  } catch (err) {
    console.error('Stripe installment session error:', err.message);
    res.status(500).json({ error: 'Failed to create installment payment session.' });
  }
});

// Create PayMongo Checkout Session for next monthly installment payment via GCash
router.post('/gcash/create-installment-session', authenticateToken, async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Order ID is required.' });

    const order = await Order.findOne({ _id: order_id, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.payment_method !== 'installment') {
      return res.status(400).json({ error: 'This order is not using installment payment.' });
    }

    const plan = await InstallmentPlan.findOne({ order_id: order._id }).lean();
    if (!plan) return res.status(404).json({ error: 'Installment plan not found.' });
    if (!plan.down_payment_paid) {
      return res.status(400).json({ error: 'Down payment must be paid before monthly installment payment.' });
    }
    if (!isInstallmentPayableStatus(plan.status)) {
      return res.status(400).json({ error: `Cannot pay for installment plan status ${plan.status}.` });
    }

    await markOverdueScheduleRows(plan._id);

    const nextRow = await InstallmentSchedule.findOne({
      installment_plan_id: plan._id,
      status: { $ne: 'paid' },
    }).sort({ installment_number: 1 }).lean();

    if (!nextRow) {
      return res.status(400).json({ error: 'All installments are already paid.' });
    }

    const dueLeft = roundCurrency((nextRow.amount_due || 0) - (nextRow.amount_paid || 0));
    if (dueLeft <= 0) {
      return res.status(400).json({ error: 'No payable balance left for the next installment.' });
    }

    const session = await createPaymongoCheckoutSession({
      req,
      userId: req.user.id,
      amount: dueLeft,
      type: 'installment',
      cancelPath: `/orders/${order._id}`,
      lineItemName: `Installment #${nextRow.installment_number} — ${order.order_number}`,
      lineItemDescription: 'GCash checkout monthly installment payment for SR-5 order.',
      metadata: {
        order_id: order._id.toString(),
        order_number: order.order_number,
        installment_plan_id: plan._id.toString(),
        installment_number: String(nextRow.installment_number),
      },
    });

    return res.json({
      ...session,
      installment_number: nextRow.installment_number,
      amount_due: dueLeft,
    });
  } catch (err) {
    console.error('GCash installment session error:', err.message);
    return res.status(500).json({ error: 'Failed to create GCash installment session.' });
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

// Verify Stripe monthly installment payment and update schedule
router.post('/stripe/verify-installment', authenticateToken, async (req, res) => {
  let dbSession = null;
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured on the server.' });
    }

    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'Session ID is required.' });

    const stripeSession = await stripe.checkout.sessions.retrieve(session_id);
    if (stripeSession.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed.' });
    }

    if (!Number.isFinite(stripeSession.amount_total) || stripeSession.amount_total <= 0) {
      return res.status(400).json({ error: 'Invalid paid amount from payment session.' });
    }

    if (stripeSession.metadata?.payment_type !== 'installment') {
      return res.status(400).json({ error: 'This session is not an installment payment session.' });
    }

    const existing = await Payment.findOne({ reference_number: stripeSession.id });
    if (existing) {
      return res.json({ ...existing.toObject(), id: existing._id, already_recorded: true });
    }

    const orderId = stripeSession.metadata?.order_id;
    const planId = stripeSession.metadata?.installment_plan_id;
    const installmentNumber = Number(stripeSession.metadata?.installment_number);
    if (!orderId || !planId || !Number.isInteger(installmentNumber) || installmentNumber <= 0) {
      return res.status(400).json({ error: 'Invalid installment payment metadata from Stripe session.' });
    }

    const order = await Order.findOne({ _id: orderId, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const amount = roundCurrency(stripeSession.amount_total / 100);

    dbSession = await Order.startSession();
    await dbSession.startTransaction();

    const result = await applyInstallmentOnlinePayment({
      planId,
      installmentNumber,
      amount,
      referenceNumber: stripeSession.id,
      userId: req.user.id,
      paymentMethod: 'credit_card',
      session: dbSession,
    });

    if (result.alreadyRecorded) {
      await dbSession.abortTransaction();
      return res.json({
        ...result.payment.toObject(),
        id: result.payment._id,
        already_recorded: true,
      });
    }

    await dbSession.commitTransaction();

    return res.json({
      ...result.payment.toObject(),
      id: result.payment._id,
      order_id: orderId,
      installment_number: installmentNumber,
    });
  } catch (err) {
    if (dbSession && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Stripe installment verify error:', err.message);
    return res.status(500).json({ error: 'Failed to verify installment payment.' });
  } finally {
    if (dbSession) await dbSession.endSession();
  }
});

async function recordPaymongoOrderPayment({ orderId, userId, referenceNumber, amountHint }) {
  const duplicate = await Payment.findOne({ reference_number: referenceNumber });
  if (duplicate) {
    return { payment: duplicate, orderId: duplicate.order_id, alreadyRecorded: true };
  }

  const order = await Order.findById(orderId);
  if (!order) throw createHttpError(404, 'Order not found.');
  if (order.payment_method === 'installment') {
    throw createHttpError(400, 'Use installment payment flow for installment orders.');
  }

  const completedPayments = await Payment.find({ order_id: order._id, status: 'completed' }).lean();
  const totalPaid = getUniqueCompletedPaymentTotal(completedPayments);
  const remainingBalance = roundCurrency(Math.max(0, Number(order.total_amount || 0) - totalPaid));
  if (remainingBalance <= 0) {
    throw createHttpError(400, 'This order has no remaining balance to pay.');
  }

  let amountToApply = roundCurrency(amountHint);
  if (!Number.isFinite(amountToApply) || amountToApply <= 0) {
    amountToApply = remainingBalance;
  }
  amountToApply = Math.min(amountToApply, remainingBalance);

  const payment = await Payment.create({
    order_id: order._id,
    user_id: userId || order.user_id,
    amount: amountToApply,
    payment_method: 'gcash',
    payment_type: amountToApply >= remainingBalance ? 'full' : 'partial',
    reference_number: referenceNumber,
    status: 'completed',
    receipt_number: generateReceiptNumber(),
  });

  await Order.findByIdAndUpdate(order._id, { status: 'confirmed' });

  return {
    payment,
    orderId: order._id,
    alreadyRecorded: false,
  };
}

async function recordPaymongoOrderReservationPayment({ orderId, userId, referenceNumber }) {
  const duplicate = await Payment.findOne({ reference_number: referenceNumber });
  if (duplicate) {
    return { payment: duplicate, orderId: duplicate.order_id, alreadyRecorded: true };
  }

  const order = await Order.findById(orderId);
  if (!order) throw createHttpError(404, 'Order not found.');
  if (order.reservation_fee_paid) throw createHttpError(400, 'Reservation fee already paid.');

  const amount = roundCurrency(order.reservation_fee_total);
  if (amount <= 0) throw createHttpError(400, 'Invalid reservation fee amount.');

  const payment = await Payment.create({
    order_id: order._id,
    user_id: userId || order.user_id,
    amount,
    payment_method: 'gcash',
    payment_type: 'reservation',
    reference_number: referenceNumber,
    status: 'completed',
    receipt_number: generateReceiptNumber(),
  });

  await Order.findByIdAndUpdate(order._id, { reservation_fee_paid: true, status: 'confirmed' });

  return {
    payment,
    orderId: order._id,
    alreadyRecorded: false,
  };
}

async function recordPaymongoInstallmentPayment({ planId, installmentNumber, referenceNumber, amountHint, userId }) {
  const duplicate = await Payment.findOne({ reference_number: referenceNumber });
  if (duplicate) {
    return { payment: duplicate, orderId: duplicate.order_id, installmentNumber: duplicate.installment_number, alreadyRecorded: true };
  }

  const normalizedInstallmentNumber = Number(installmentNumber);
  if (!Number.isInteger(normalizedInstallmentNumber) || normalizedInstallmentNumber <= 0) {
    throw createHttpError(400, 'Invalid installment number for PayMongo installment payment.');
  }

  const plan = await InstallmentPlan.findById(planId).lean();
  if (!plan) throw createHttpError(404, 'Installment plan not found.');

  let normalizedAmount = roundCurrency(amountHint);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    const installmentRow = await InstallmentSchedule.findOne({
      installment_plan_id: plan._id,
      installment_number: normalizedInstallmentNumber,
    }).lean();

    if (!installmentRow) throw createHttpError(404, 'Installment schedule row not found.');
    normalizedAmount = roundCurrency((installmentRow.amount_due || 0) - (installmentRow.amount_paid || 0));
  }

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw createHttpError(400, 'Invalid installment amount for PayMongo payment.');
  }

  let dbSession = null;
  try {
    dbSession = await Order.startSession();
    await dbSession.startTransaction();

    const result = await applyInstallmentOnlinePayment({
      planId,
      installmentNumber: normalizedInstallmentNumber,
      amount: normalizedAmount,
      referenceNumber,
      userId: userId || plan.user_id,
      paymentMethod: 'gcash',
      session: dbSession,
    });

    if (result.alreadyRecorded) {
      await dbSession.abortTransaction();
      return {
        payment: result.payment,
        orderId: result.payment.order_id,
        installmentNumber: result.payment.installment_number,
        alreadyRecorded: true,
      };
    }

    await dbSession.commitTransaction();
    return {
      payment: result.payment,
      orderId: result.payment.order_id,
      installmentNumber: normalizedInstallmentNumber,
      alreadyRecorded: false,
    };
  } catch (err) {
    if (dbSession && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }
    throw err;
  } finally {
    if (dbSession) await dbSession.endSession();
  }
}

// Verify PayMongo checkout session and record GCash payment
router.post('/gcash/verify', authenticateToken, async (req, res) => {
  try {
    const { session_id, checkout_reference } = req.body;
    if (!session_id && !checkout_reference) {
      return res.status(400).json({ error: 'Session ID or checkout reference is required.' });
    }

    const context = getValidatedPaymongoCheckoutContext({
      sessionId: session_id || null,
      checkoutReference: checkout_reference || null,
      userId: req.user.id,
    });

    const resolvedSessionId = session_id || context?.sessionId;
    if (!resolvedSessionId) {
      return res.status(404).json({ error: 'PayMongo checkout session could not be resolved.' });
    }

    const existing = await Payment.findOne({ reference_number: resolvedSessionId });
    if (existing) {
      clearPaymongoCheckoutContext(resolvedSessionId, checkout_reference || null);
      return res.json({ ...existing.toObject(), id: existing._id, already_recorded: true });
    }

    const checkoutPayload = await paymongoRequest(`/checkout_sessions/${encodeURIComponent(resolvedSessionId)}`);
    const checkoutResource = normalizePaymongoCheckoutResource(checkoutPayload);
    if (!checkoutResource) {
      return res.status(404).json({ error: 'PayMongo checkout session not found.' });
    }

    const details = extractPaymongoCheckoutDetails(checkoutResource);
    const fallbackContext = context
      || getPaymongoCheckoutContextBySession(details.sessionId)
      || getPaymongoCheckoutContextByReference(checkout_reference || details.metadata?.checkout_reference);

    rememberResolvedPaymongoSession(fallbackContext, details.sessionId);

    const ownerId = String(details.metadata?.user_id || fallbackContext?.userId || '');
    if (ownerId && ownerId !== String(req.user.id)) {
      return res.status(403).json({ error: 'This PayMongo checkout session does not belong to this account.' });
    }

    if (!details.paid) {
      return res.status(400).json({ error: 'Payment not completed yet. Please finish your GCash checkout.' });
    }

    const flowType = details.metadata?.flow_type || fallbackContext?.type;
    const mergedMetadata = {
      ...(fallbackContext?.metadata || {}),
      ...(details.metadata || {}),
    };
    const amountHint = details.amountPaid > 0
      ? details.amountPaid
      : roundCurrency(fallbackContext?.amount || 0);

    let recordResult = null;
    if (flowType === 'order') {
      recordResult = await recordPaymongoOrderPayment({
        orderId: mergedMetadata.order_id,
        userId: req.user.id,
        referenceNumber: details.sessionId,
        amountHint,
      });
    } else if (flowType === 'order_reservation') {
      recordResult = await recordPaymongoOrderReservationPayment({
        orderId: mergedMetadata.order_id,
        userId: req.user.id,
        referenceNumber: details.sessionId,
      });
    } else if (flowType === 'installment') {
      recordResult = await recordPaymongoInstallmentPayment({
        planId: mergedMetadata.installment_plan_id,
        installmentNumber: Number(mergedMetadata.installment_number),
        referenceNumber: details.sessionId,
        amountHint,
        userId: req.user.id,
      });
    } else {
      return res.status(400).json({ error: 'Unsupported PayMongo checkout payment flow.' });
    }

    clearPaymongoCheckoutContext(details.sessionId, mergedMetadata.checkout_reference || checkout_reference || null);

    return res.json({
      ...recordResult.payment.toObject(),
      id: recordResult.payment._id,
      order_id: recordResult.orderId,
      ...(flowType === 'installment' ? { installment_number: recordResult.installmentNumber } : {}),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('PayMongo verify error:', err.message);
    return res.status(500).json({ error: 'Failed to verify GCash payment.' });
  }
});

// PayMongo webhook receiver for checkout session payments
router.post('/paymongo/webhook', async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : JSON.stringify(req.body || {});

    const payload = Buffer.isBuffer(req.body)
      ? JSON.parse(rawBody || '{}')
      : (req.body || {});

    const eventType = payload?.data?.attributes?.type;
    const livemode = Boolean(payload?.data?.attributes?.livemode);

    const signatureHeader = req.get('Paymongo-Signature') || req.get('paymongo-signature') || '';
    if (!verifyPaymongoWebhookSignature({ headerValue: signatureHeader, rawBody, livemode })) {
      return res.status(400).json({ error: 'Invalid PayMongo signature.' });
    }

    if (eventType !== 'checkout_session.payment.paid') {
      return res.status(200).json({ message: 'Ignored event type.' });
    }

    const checkoutResource = normalizePaymongoCheckoutResource(payload);
    if (!checkoutResource) {
      return res.status(200).json({ message: 'No checkout session payload to process.' });
    }

    const details = extractPaymongoCheckoutDetails(checkoutResource);
    if (!details.sessionId || !details.paid) {
      return res.status(200).json({ message: 'Checkout session not marked paid yet.' });
    }

    const existing = await Payment.findOne({ reference_number: details.sessionId });
    if (existing) {
      return res.status(200).json({ message: 'Payment already recorded.' });
    }

    const context = getPaymongoCheckoutContextBySession(details.sessionId)
      || getPaymongoCheckoutContextByReference(details.metadata?.checkout_reference);

    const flowType = details.metadata?.flow_type || context?.type;
    const mergedMetadata = {
      ...(context?.metadata || {}),
      ...(details.metadata || {}),
    };
    const amountHint = details.amountPaid > 0
      ? details.amountPaid
      : roundCurrency(context?.amount || 0);

    if (flowType === 'order') {
      await recordPaymongoOrderPayment({
        orderId: mergedMetadata.order_id,
        userId: mergedMetadata.user_id || context?.userId,
        referenceNumber: details.sessionId,
        amountHint,
      });
    } else if (flowType === 'order_reservation') {
      await recordPaymongoOrderReservationPayment({
        orderId: mergedMetadata.order_id,
        userId: mergedMetadata.user_id || context?.userId,
        referenceNumber: details.sessionId,
      });
    } else if (flowType === 'installment') {
      await recordPaymongoInstallmentPayment({
        planId: mergedMetadata.installment_plan_id,
        installmentNumber: Number(mergedMetadata.installment_number),
        referenceNumber: details.sessionId,
        amountHint,
        userId: mergedMetadata.user_id || context?.userId,
      });
    }

    clearPaymongoCheckoutContext(details.sessionId, mergedMetadata.checkout_reference || null);

    return res.status(200).json({ message: 'Webhook event processed.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('PayMongo webhook error:', err.message);
    return res.status(500).json({ error: 'Failed to process webhook event.' });
  }
});

module.exports = router;
