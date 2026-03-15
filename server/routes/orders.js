const express = require('express');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const CartItem = require('../models/CartItem');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const InstallmentPlan = require('../models/InstallmentPlan');
const InstallmentSchedule = require('../models/InstallmentSchedule');
const ReturnRequest = require('../models/ReturnRequest');
const InventoryLog = require('../models/InventoryLog');
const { authenticateToken } = require('../middleware/auth');
const { generateOrderNumber, calculateReservationFee } = require('../utils/helpers');

const router = express.Router();

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

function getItemReservationExpiry(productType) {
  const now = new Date();
  if (productType === 'vehicle') {
    now.setDate(now.getDate() + 7);
  } else {
    now.setHours(now.getHours() + 48);
  }
  return now;
}

async function releaseOrderInventory(orderId, userId) {
  const items = await OrderItem.find({ order_id: orderId }).lean();
  for (const item of items) {
    const product = await Product.findById(item.product_id);
    if (!product) continue;

    if (product.type === 'vehicle') {
      product.status = 'available';
      await product.save();
      continue;
    }

    const prevQty = product.stock_quantity || 0;
    product.stock_quantity = prevQty + (item.quantity || 0);
    if (product.stock_quantity > 0 && product.status === 'sold_out') {
      product.status = 'available';
    }
    await product.save();

    await InventoryLog.create({
      product_id: product._id,
      change_type: 'restock',
      quantity_change: item.quantity,
      previous_quantity: prevQty,
      new_quantity: product.stock_quantity,
      notes: `Order cancellation release ${orderId}`,
      created_by: userId,
    });
  }
}

async function enrichOrder(order) {
  const items = await OrderItem.find({ order_id: order._id }).populate('product_id', 'name image_url type').lean();
  const payments = await Payment.find({ order_id: order._id, status: { $in: ['completed', 'pending'] } }).sort({ created_at: -1 }).lean();
  const installmentPlan = await InstallmentPlan.findOne({ order_id: order._id }).lean();

  let installmentSchedule = [];
  if (installmentPlan) {
    const now = new Date();
    await InstallmentSchedule.updateMany(
      {
        installment_plan_id: installmentPlan._id,
        status: { $in: ['pending', 'partially_paid'] },
        due_date: { $lt: now },
      },
      { status: 'overdue' }
    );

    installmentSchedule = await InstallmentSchedule.find({ installment_plan_id: installmentPlan._id })
      .sort({ installment_number: 1 })
      .lean();
  }

  const totalPaid = getUniqueCompletedPaymentTotal(payments);

  order.items = items.map(i => ({
    id: i._id,
    product_id: i.product_id?._id,
    name: i.product_id?.name,
    product_name: i.product_id?.name,
    product_image: i.product_id?.image_url,
    product_type: i.product_id?.type,
    quantity: i.quantity,
    unit_price: i.unit_price,
    subtotal: i.subtotal,
    reservation_expires_at: i.reservation_expires_at || null,
  }));

  order.payments = payments.map(p => ({
    id: p._id,
    amount: p.amount,
    payment_method: p.payment_method,
    payment_type: p.payment_type,
    status: p.status,
    receipt_number: p.receipt_number,
    reference_number: p.reference_number,
    installment_number: p.installment_number,
    total_installments: p.total_installments,
    created_at: p.created_at,
  }));

  if (installmentPlan) {
    const paidScheduleTotal = installmentSchedule.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
    const nextPending = installmentSchedule.find(row => row.status !== 'paid') || null;

    order.installment_plan = {
      id: installmentPlan._id,
      status: installmentPlan.status,
      total_financed_amount: installmentPlan.total_financed_amount,
      down_payment_amount: installmentPlan.down_payment_amount,
      down_payment_paid: installmentPlan.down_payment_paid,
      number_of_installments: installmentPlan.number_of_installments,
      monthly_amount: installmentPlan.monthly_amount,
      interest_rate: installmentPlan.interest_rate,
      total_with_interest: installmentPlan.total_with_interest,
      start_date: installmentPlan.start_date,
      created_at: installmentPlan.created_at,
      paid_schedule_total: Number(paidScheduleTotal.toFixed(2)),
      remaining_schedule_total: Number(Math.max(0, (installmentPlan.total_with_interest || 0) - paidScheduleTotal).toFixed(2)),
      next_due_date: nextPending?.due_date || null,
      schedule: installmentSchedule.map(row => ({
        id: row._id,
        installment_number: row.installment_number,
        amount_due: row.amount_due,
        amount_paid: row.amount_paid,
        due_date: row.due_date,
        paid_date: row.paid_date,
        status: row.status,
      })),
    };
  } else {
    order.installment_plan = null;
  }

  order.id = order._id;
  order.total_paid = totalPaid;
  order.remaining_balance = Math.max(0, (order.total_amount || 0) - totalPaid);
  return order;
}

// Get user orders
router.get('/', authenticateToken, async (req, res) => {
  try {
    const orders = await Order.find({ user_id: req.user.id }).sort({ created_at: -1 }).lean();
    for (const order of orders) {
      await enrichOrder(order);
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get single order
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    await enrichOrder(order);
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create order from cart
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { delivery_method, delivery_address, notes } = req.body;

    const cartItems = await CartItem.find({ user_id: req.user.id }).populate('product_id').lean();
    if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty.' });

    // Validate stock
    for (const item of cartItems) {
      if (!item.product_id) return res.status(400).json({ error: 'A product in your cart no longer exists.' });
      if (item.product_id.status !== 'available') return res.status(400).json({ error: `${item.product_id.name} is no longer available.` });
      if (item.product_id.type !== 'vehicle' && item.product_id.stock_quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${item.product_id.name}.` });
      }
    }

    let total = 0;
    let reservationFeeTotal = 0;
    const hasVehicle = cartItems.some(item => item.product_id?.type === 'vehicle');
    for (const item of cartItems) {
      total += item.product_id.price * item.quantity;
      if (item.product_id.type === 'vehicle') {
        reservationFeeTotal += calculateReservationFee(item.product_id) * item.quantity;
      }
    }

    const reservationExpiresAt = getItemReservationExpiry(hasVehicle ? 'vehicle' : 'general');

    const order = await Order.create({
      user_id: req.user.id,
      order_number: generateOrderNumber(),
      total_amount: total,
      status: 'pending',
      has_vehicle: hasVehicle,
      reservation_fee_total: reservationFeeTotal,
      reservation_fee_paid: reservationFeeTotal <= 0,
      reservation_expires_at: reservationExpiresAt,
      delivery_method: delivery_method || 'pickup',
      delivery_address: delivery_address || null,
      notes: notes || null,
    });

    for (const item of cartItems) {
      await OrderItem.create({
        order_id: order._id,
        product_id: item.product_id._id,
        quantity: item.quantity,
        unit_price: item.product_id.price,
        subtotal: item.product_id.price * item.quantity,
        reservation_expires_at: getItemReservationExpiry(item.product_id.type),
      });

      // Reserve vehicles immediately so they are not sold to another customer.
      if (item.product_id.type === 'vehicle') {
        await Product.findByIdAndUpdate(item.product_id._id, { status: 'reserved' });
      }

      // Decrement stock for non-vehicle items
      if (item.product_id.type !== 'vehicle') {
        const product = await Product.findById(item.product_id._id);
        const prevQty = product.stock_quantity;
        product.stock_quantity = Math.max(0, product.stock_quantity - item.quantity);
        if (product.stock_quantity <= 0) product.status = 'sold_out';
        await product.save();
        await InventoryLog.create({ product_id: product._id, change_type: 'sale', quantity_change: -item.quantity, previous_quantity: prevQty, new_quantity: product.stock_quantity, notes: `Order ${order.order_number}`, created_by: req.user.id });
      }
    }

    // Clear cart
    await CartItem.deleteMany({ user_id: req.user.id });

    res.status(201).json({ ...order.toObject(), id: order._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating order.' });
  }
});

// Update order status (customer cancel)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (status === 'cancelled' && order.status !== 'cancelled') {
      await releaseOrderInventory(order._id, req.user.id);
    }

    order.status = status;
    await order.save();
    res.json({ ...order.toObject(), id: order._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create return request
router.post('/:id/return', authenticateToken, async (req, res) => {
  try {
    const { order_item_id, reason, request_type } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!['delivered', 'completed'].includes(order.status)) {
      return res.status(400).json({ error: 'Returns can only be requested for delivered orders.' });
    }

    const returnReq = await ReturnRequest.create({
      order_id: order._id,
      order_item_id: order_item_id || null,
      user_id: req.user.id,
      reason: reason || '',
      request_type: request_type || 'return',
    });

    res.status(201).json({ ...returnReq.toObject(), id: returnReq._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating return request.' });
  }
});

module.exports = router;
