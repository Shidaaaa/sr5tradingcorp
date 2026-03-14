const express = require('express');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const CartItem = require('../models/CartItem');
const Product = require('../models/Product');
const Payment = require('../models/Payment');
const ReturnRequest = require('../models/ReturnRequest');
const InventoryLog = require('../models/InventoryLog');
const { authenticateToken } = require('../middleware/auth');
const { generateOrderNumber, calculateReservationFee } = require('../utils/helpers');

const router = express.Router();

const VEHICLE_ALLOWED_PAYMENT_METHODS = new Set(['gcash', 'bank_transfer', 'installment']);
const INSTALLMENT_PLANS = {
  vehicle_50_12_1: {
    name: '50% Downpayment • 12 Months • 1% Interest',
    downpaymentRate: 0.5,
    months: 12,
    interestRate: 0.01,
  },
};

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
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

function getInstallmentPlan(planId) {
  return INSTALLMENT_PLANS[planId] || null;
}

function buildVehiclePaymentPlan(totalAmount, reservationFeeTotal, paymentMethod, planId) {
  if (paymentMethod !== 'installment') {
    return {
      vehicle_payment_method: paymentMethod,
      installment_plan_name: null,
      installment_downpayment_rate: 0,
      installment_interest_rate: 0,
      installment_months: 0,
      pickup_payment_required_total: roundCurrency(totalAmount),
      financed_amount: 0,
      monthly_installment_amount: 0,
      installment_schedule: [],
    };
  }

  const plan = getInstallmentPlan(planId || 'vehicle_50_12_1');
  const pickupPaymentRequiredTotal = roundCurrency(totalAmount * plan.downpaymentRate);
  const financedAmount = roundCurrency(totalAmount - pickupPaymentRequiredTotal);
  const monthlyInstallmentAmount = roundCurrency(
    (financedAmount * (1 + (plan.interestRate * plan.months))) / plan.months
  );

  return {
    vehicle_payment_method: paymentMethod,
    installment_plan_name: plan.name,
    installment_downpayment_rate: plan.downpaymentRate,
    installment_interest_rate: plan.interestRate,
    installment_months: plan.months,
    pickup_payment_required_total: pickupPaymentRequiredTotal,
    financed_amount: financedAmount,
    monthly_installment_amount: monthlyInstallmentAmount,
    installment_schedule: [],
  };
}

function generateInstallmentSchedule(order, pickupDate = new Date()) {
  if (!order.installment_months || !order.monthly_installment_amount || !order.financed_amount) {
    return [];
  }

  const schedule = [];
  for (let index = 1; index <= order.installment_months; index += 1) {
    const dueDate = new Date(pickupDate);
    dueDate.setMonth(dueDate.getMonth() + index);
    schedule.push({
      installment_number: index,
      due_date: dueDate,
      amount: roundCurrency(order.monthly_installment_amount),
      status: 'pending',
      paid_at: null,
      payment_id: null,
    });
  }
  return schedule;
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

function summarizePayments(order, payments) {
  const completedPayments = payments.filter(payment => payment.status === 'completed');
  const totalPaid = roundCurrency(completedPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0));
  const reservationPaidAmount = roundCurrency(
    completedPayments
      .filter(payment => payment.payment_type === 'reservation')
      .reduce((sum, payment) => sum + (payment.amount || 0), 0)
  );
  const remainingBalance = Math.max(0, roundCurrency((order.total_amount || 0) - totalPaid));
  const pickupRequired = order.has_vehicle
    ? roundCurrency(order.vehicle_payment_method === 'installment'
      ? (order.pickup_payment_required_total || order.total_amount || 0)
      : (order.total_amount || 0))
    : roundCurrency(order.total_amount || 0);
  const pickupClearanceMet = order.has_vehicle
    ? totalPaid >= pickupRequired
    : remainingBalance <= 0;
  const pickupBalanceDue = Math.max(0, roundCurrency(pickupRequired - totalPaid));
  const fullPaymentCompleted = remainingBalance <= 0;

  const installmentSchedule = (order.installment_schedule || []).map(entry => ({
    installment_number: entry.installment_number,
    due_date: entry.due_date,
    amount: entry.amount,
    status: entry.status,
    paid_at: entry.paid_at,
    payment_id: entry.payment_id,
  }));

  return {
    totalPaid,
    reservationPaidAmount,
    remainingBalance,
    pickupRequired,
    pickupClearanceMet,
    pickupBalanceDue,
    fullPaymentCompleted,
    installmentSchedule,
  };
}

async function enrichOrder(order) {
  const items = await OrderItem.find({ order_id: order._id }).populate('product_id', 'name image_url type').lean();
  const payments = await Payment.find({ order_id: order._id }).sort({ created_at: -1 }).lean();
  const summary = summarizePayments(order, payments);

  order.items = items.map(item => ({
    id: item._id,
    product_id: item.product_id?._id,
    name: item.product_id?.name,
    product_name: item.product_id?.name,
    product_image: item.product_id?.image_url,
    product_type: item.product_id?.type,
    quantity: item.quantity,
    unit_price: item.unit_price,
    subtotal: item.subtotal,
    reservation_expires_at: item.reservation_expires_at || null,
  }));

  order.payments = payments.map(payment => ({
    id: payment._id,
    amount: payment.amount,
    payment_method: payment.payment_method,
    payment_type: payment.payment_type,
    status: payment.status,
    reference_number: payment.reference_number,
    receipt_number: payment.receipt_number,
    installment_number: payment.installment_number,
    total_installments: payment.total_installments,
    installment_plan_name: payment.installment_plan_name,
    created_at: payment.created_at,
  }));

  order.id = order._id;
  order.total_paid = summary.totalPaid;
  order.reservation_paid_amount = summary.reservationPaidAmount;
  order.remaining_balance = summary.remainingBalance;
  order.pickup_payment_required_total = summary.pickupRequired;
  order.pickup_balance_due = summary.pickupBalanceDue;
  order.pickup_clearance_met = summary.pickupClearanceMet;
  order.full_payment_completed = summary.fullPaymentCompleted;
  order.installment_schedule = summary.installmentSchedule;
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
    const { delivery_method, delivery_address, notes, payment_method, installment_plan } = req.body;

    const cartItems = await CartItem.find({ user_id: req.user.id }).populate('product_id').lean();
    if (!cartItems.length) return res.status(400).json({ error: 'Cart is empty.' });

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

    if (hasVehicle && !VEHICLE_ALLOWED_PAYMENT_METHODS.has(payment_method)) {
      return res.status(400).json({ error: 'Vehicle orders only support installment, GCash, or bank transfer.' });
    }
    if (hasVehicle && payment_method === 'installment' && !getInstallmentPlan(installment_plan || 'vehicle_50_12_1')) {
      return res.status(400).json({ error: 'Invalid installment plan.' });
    }

    const reservationExpiresAt = getItemReservationExpiry(hasVehicle ? 'vehicle' : 'general');
    const vehiclePaymentPlan = hasVehicle
      ? buildVehiclePaymentPlan(total, reservationFeeTotal, payment_method, installment_plan || 'vehicle_50_12_1')
      : {
          vehicle_payment_method: null,
          installment_plan_name: null,
          installment_downpayment_rate: 0,
          installment_interest_rate: 0,
          installment_months: 0,
          pickup_payment_required_total: 0,
          financed_amount: 0,
          monthly_installment_amount: 0,
          installment_schedule: [],
        };

    const order = await Order.create({
      user_id: req.user.id,
      order_number: generateOrderNumber(),
      total_amount: roundCurrency(total),
      status: 'pending',
      has_vehicle: hasVehicle,
      reservation_fee_total: roundCurrency(reservationFeeTotal),
      reservation_fee_paid: reservationFeeTotal <= 0,
      reservation_expires_at: reservationExpiresAt,
      ...vehiclePaymentPlan,
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

      if (item.product_id.type === 'vehicle') {
        await Product.findByIdAndUpdate(item.product_id._id, { status: 'reserved' });
      }

      if (item.product_id.type !== 'vehicle') {
        const product = await Product.findById(item.product_id._id);
        const prevQty = product.stock_quantity;
        product.stock_quantity = Math.max(0, product.stock_quantity - item.quantity);
        if (product.stock_quantity <= 0) product.status = 'sold_out';
        await product.save();
        await InventoryLog.create({
          product_id: product._id,
          change_type: 'sale',
          quantity_change: -item.quantity,
          previous_quantity: prevQty,
          new_quantity: product.stock_quantity,
          notes: `Order ${order.order_number}`,
          created_by: req.user.id,
        });
      }
    }

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
