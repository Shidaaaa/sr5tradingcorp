const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const InventoryLog = require('../models/InventoryLog');
const Feedback = require('../models/Feedback');
const ReturnRequest = require('../models/ReturnRequest');
const VehicleInquiry = require('../models/VehicleInquiry');
const { generateReceiptNumber } = require('../utils/helpers');

const router = express.Router();

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function summarizeOrderPayments(order, payments) {
  const completedPayments = payments.filter(payment => payment.status === 'completed');
  const totalPaid = roundCurrency(completedPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0));
  const remainingBalance = Math.max(0, roundCurrency((order.total_amount || 0) - totalPaid));
  const pickupRequired = order.has_vehicle
    ? roundCurrency(order.vehicle_payment_method === 'installment'
      ? (order.pickup_payment_required_total || order.total_amount || 0)
      : (order.total_amount || 0))
    : roundCurrency(order.total_amount || 0);

  return {
    totalPaid,
    remainingBalance,
    fullPaymentCompleted: remainingBalance <= 0,
    pickupClearanceMet: order.has_vehicle ? totalPaid >= pickupRequired : remainingBalance <= 0,
    pickupRequired,
    pickupBalanceDue: Math.max(0, roundCurrency(pickupRequired - totalPaid)),
  };
}

async function autoCompleteOrderIfFullyPaid(order) {
  const payments = await Payment.find({ order_id: order._id }).lean();
  const summary = summarizeOrderPayments(order, payments);
  if (summary.fullPaymentCompleted && order.status !== 'completed') {
    order.status = 'completed';
    await order.save();
  }
  return summary;
}

function generateInstallmentSchedule(order, pickupDate = new Date()) {
  if (!order.installment_months || !order.monthly_installment_amount || (order.installment_schedule || []).length > 0) {
    return order.installment_schedule || [];
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

// Dashboard stats
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalProducts, totalOrders, pendingOrders, completedOrders, totalCustomers, totalBookings, pendingBookings, pendingFeedback, pendingReturns, soldOutProducts, inventoryForLowStock] = await Promise.all([
      Product.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: { $in: ['completed', 'delivered'] } }),
      User.countDocuments({ role: 'customer' }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: 'pending' }),
      Feedback.countDocuments({ status: 'pending' }),
      ReturnRequest.countDocuments({ status: 'pending' }),
      Product.countDocuments({ status: 'sold_out' }),
      Product.find().select('stock_quantity reorder_level status').lean(),
    ]);

    const lowStockProducts = inventoryForLowStock.filter((p) => {
      const reorderLevel = Number(p.reorder_level || 5);
      const isOut = p.stock_quantity <= 0 || p.status === 'sold_out';
      return !isOut && p.stock_quantity <= reorderLevel;
    }).length;

    const totalRevenueResult = await Payment.aggregate([
      { $match: { status: { $in: ['completed', 'pending'] } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const monthlyRevenueResult = await Payment.aggregate([
      { $match: { status: { $in: ['completed', 'pending'] }, created_at: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const recentOrders = await Order.find().sort({ created_at: -1 }).limit(5)
      .populate('user_id', 'first_name last_name').lean();

    const recentBookings = await Booking.find().sort({ created_at: -1 }).limit(5)
      .populate('user_id', 'first_name last_name')
      .populate('product_id', 'name').lean();

    res.json({
      revenue: { total: totalRevenueResult[0]?.total || 0, monthly: monthlyRevenueResult[0]?.total || 0 },
      orders: { total: totalOrders, pending: pendingOrders, completed: completedOrders },
      products: { total: totalProducts, low_stock: lowStockProducts, sold_out: soldOutProducts },
      bookings: { total: totalBookings, pending: pendingBookings },
      customers: { total: totalCustomers },
      feedback: { pending: pendingFeedback },
      returns: { pending: pendingReturns },
      recentOrders: recentOrders.map(o => ({ ...o, id: o._id, customer_name: o.user_id ? `${o.user_id.first_name} ${o.user_id.last_name}` : 'Unknown' })),
      recentBookings: recentBookings.map(b => ({ ...b, id: b._id, customer_name: b.user_id ? `${b.user_id.first_name} ${b.user_id.last_name}` : 'Unknown', product_name: b.product_id?.name })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// All orders
router.get('/orders', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).sort({ created_at: -1 })
      .populate('user_id', 'first_name last_name email').lean();
    for (const order of orders) {
      const items = await OrderItem.find({ order_id: order._id }).populate('product_id', 'name image_url type').lean();
      order.items = items.map(i => ({
        id: i._id,
        name: i.product_id?.name,
        product_type: i.product_id?.type,
        product_image: i.product_id?.image_url,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
      }));
      const payments = await Payment.find({ order_id: order._id }).lean();
      order.payments = payments.map(p => ({
        id: p._id,
        amount: p.amount,
        payment_method: p.payment_method,
        payment_type: p.payment_type,
        status: p.status,
        installment_number: p.installment_number,
        total_installments: p.total_installments,
        created_at: p.created_at,
      }));
      const summary = summarizeOrderPayments(order, payments);
      if (summary.fullPaymentCompleted && !['completed', 'cancelled', 'returned'].includes(order.status)) {
        await Order.findByIdAndUpdate(order._id, { status: 'completed' });
        order.status = 'completed';
      }
      order.id = order._id;
      order.first_name = order.user_id?.first_name || 'Unknown';
      order.last_name = order.user_id?.last_name || '';
      order.email = order.user_id?.email || '';
      order.total_paid = summary.totalPaid;
      order.remaining_balance = summary.remainingBalance;
      order.full_payment_completed = summary.fullPaymentCompleted;
      order.pickup_clearance_met = summary.pickupClearanceMet;
      order.pickup_payment_required_total = summary.pickupRequired;
      order.pickup_balance_due = summary.pickupBalanceDue;
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Installment clients tracker
router.get('/orders/installments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const orders = await Order.find({
      has_vehicle: true,
      vehicle_payment_method: 'installment',
      status: { $nin: ['cancelled', 'returned'] },
    })
      .sort({ updated_at: -1 })
      .populate('user_id', 'first_name last_name email')
      .lean();

    const result = [];
    for (const order of orders) {
      const schedule = (order.installment_schedule || []).sort((a, b) => a.installment_number - b.installment_number);
      const paid_count = schedule.filter(entry => entry.status === 'paid').length;
      const total_count = schedule.length;
      const next_due = schedule.find(entry => entry.status !== 'paid') || null;

      result.push({
        id: order._id,
        order_id: order._id,
        order_number: order.order_number,
        customer_name: order.user_id ? `${order.user_id.first_name} ${order.user_id.last_name}` : 'Unknown',
        customer_email: order.user_id?.email || '',
        status: order.status,
        monthly_installment_amount: order.monthly_installment_amount || 0,
        installment_plan_name: order.installment_plan_name || null,
        installment_months: order.installment_months || total_count,
        paid_installments: paid_count,
        total_installments: total_count,
        next_due_installment: next_due?.installment_number || null,
        next_due_date: next_due?.due_date || null,
        next_due_amount: next_due?.amount || 0,
        created_at: order.created_at,
        updated_at: order.updated_at,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update order status
router.put('/orders/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const allowedStatuses = ['picked_up', 'delivered'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Only picked up or delivered statuses are allowed from admin actions.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Cancelled orders are locked and cannot be updated.' });
    }

    const payments = await Payment.find({ order_id: order._id }).lean();
    const summary = summarizeOrderPayments(order, payments);

    if (status === 'picked_up' && order.has_vehicle) {
      if (order.vehicle_payment_method === 'installment') {
        if (!summary.pickupClearanceMet) {
          return res.status(400).json({ error: `Pickup requires the 50% downpayment to be completed. Remaining pickup balance: ${summary.pickupBalanceDue.toFixed(2)}` });
        }
        if ((order.installment_schedule || []).length === 0) {
          order.installment_schedule = generateInstallmentSchedule(order, new Date());
        }
      } else if (!summary.fullPaymentCompleted) {
        return res.status(400).json({ error: `Pickup requires full payment. Remaining balance: ${summary.remainingBalance.toFixed(2)}` });
      }
    }

    if (status === 'picked_up' && order.status !== 'picked_up') {
      const items = await OrderItem.find({ order_id: order._id }).lean();

      for (const item of items) {
        const product = await Product.findById(item.product_id);
        if (!product) continue;

        const hasSaleLog = await InventoryLog.exists({
          product_id: product._id,
          change_type: 'sale',
          notes: `Order ${order.order_number}`,
        });

        if (hasSaleLog) {
          continue;
        }

        const previousQuantity = Number(product.stock_quantity || 0);
        product.stock_quantity = Math.max(0, previousQuantity - (item.quantity || 0));
        if (product.stock_quantity <= 0) {
          product.status = 'sold_out';
        }

        await product.save();
        await InventoryLog.create({
          product_id: product._id,
          change_type: 'sale',
          quantity_change: -(item.quantity || 0),
          previous_quantity: previousQuantity,
          new_quantity: product.stock_quantity,
          notes: `Order ${order.order_number}`,
          created_by: req.user.id,
        });
      }
    }

    order.status = status;
    await order.save();
    await autoCompleteOrderIfFullyPaid(order);
    res.json({ ...order.toObject(), id: order._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/orders/:id/installments/:installmentNumber', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.vehicle_payment_method !== 'installment') {
      return res.status(400).json({ error: 'This order is not under an installment plan.' });
    }

    const installmentNumber = Number(req.params.installmentNumber);
    const scheduleIndex = (order.installment_schedule || []).findIndex(entry => entry.installment_number === installmentNumber);
    if (scheduleIndex === -1) {
      return res.status(404).json({ error: 'Installment record not found.' });
    }

    const scheduleEntry = order.installment_schedule[scheduleIndex];
    if (scheduleEntry.status === 'paid') {
      return res.status(400).json({ error: 'This installment has already been marked as paid.' });
    }

    const payment = await Payment.create({
      order_id: order._id,
      user_id: order.user_id,
      amount: scheduleEntry.amount,
      payment_method: 'installment',
      payment_type: 'installment',
      status: 'completed',
      installment_number: scheduleEntry.installment_number,
      total_installments: order.installment_months,
      installment_plan_name: order.installment_plan_name,
      installment_interest_rate: order.installment_interest_rate,
      receipt_number: generateReceiptNumber(),
    });

    order.installment_schedule[scheduleIndex].status = 'paid';
    order.installment_schedule[scheduleIndex].paid_at = new Date();
    order.installment_schedule[scheduleIndex].payment_id = payment._id;
    await order.save();
    await autoCompleteOrderIfFullyPaid(order);

    res.json({ message: 'Installment marked as paid.', installment_number: installmentNumber, payment_id: payment._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/orders/:id/pickup-payment', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { amount, payment_method, reference_number, notes } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!order.has_vehicle) return res.status(400).json({ error: 'Pickup payment recording is only needed for vehicle orders.' });

    const allowedMethods = order.vehicle_payment_method === 'installment'
      ? ['installment', 'gcash', 'bank_transfer']
      : ['gcash', 'bank_transfer'];
    if (!allowedMethods.includes(payment_method)) {
      return res.status(400).json({ error: 'Invalid pickup payment method for this order.' });
    }

    const numericAmount = roundCurrency(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'A valid amount is required.' });
    }

    const payments = await Payment.find({ order_id: order._id }).lean();
    const summary = summarizeOrderPayments(order, payments);
    if (numericAmount > summary.remainingBalance) {
      return res.status(400).json({ error: 'Payment amount cannot exceed the remaining balance.' });
    }

    const payment = await Payment.create({
      order_id: order._id,
      user_id: order.user_id,
      amount: numericAmount,
      payment_method,
      payment_type: summary.remainingBalance - numericAmount <= 0 ? 'full' : 'partial',
      status: 'completed',
      reference_number: reference_number || null,
      installment_plan_name: order.installment_plan_name || null,
      installment_interest_rate: order.installment_interest_rate || 0,
      notes: notes || 'Recorded at pickup',
      receipt_number: generateReceiptNumber(),
    });

    await autoCompleteOrderIfFullyPaid(order);

    res.status(201).json({ ...payment.toObject(), id: payment._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Mark non-vehicle order payment
router.post('/orders/:id/mark-paid', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { amount, payment_method, reference_number, notes } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.has_vehicle) {
      return res.status(400).json({ error: 'Use pickup payment flow for vehicle orders.' });
    }
    if (['cancelled', 'returned'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot record payment for cancelled/returned orders.' });
    }

    const allowedMethods = ['cash', 'gcash', 'bank_transfer'];
    if (payment_method && !allowedMethods.includes(payment_method)) {
      return res.status(400).json({ error: 'Invalid payment method.' });
    }

    const payments = await Payment.find({ order_id: order._id }).lean();
    const summary = summarizeOrderPayments(order, payments);
    if (summary.remainingBalance <= 0) {
      return res.status(400).json({ error: 'Order is already fully paid.' });
    }

    const numericAmount = roundCurrency(amount || summary.remainingBalance);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'A valid amount is required.' });
    }
    if (numericAmount > summary.remainingBalance) {
      return res.status(400).json({ error: 'Payment amount cannot exceed the remaining balance.' });
    }

    const payment = await Payment.create({
      order_id: order._id,
      user_id: order.user_id,
      amount: numericAmount,
      payment_method: payment_method || 'cash',
      payment_type: summary.remainingBalance - numericAmount <= 0 ? 'full' : 'partial',
      status: 'completed',
      reference_number: reference_number || null,
      notes: notes || 'Marked paid by admin',
      receipt_number: generateReceiptNumber(),
    });

    const updatedSummary = await autoCompleteOrderIfFullyPaid(order);

    res.status(201).json({
      ...payment.toObject(),
      id: payment._id,
      order_status: order.status,
      remaining_balance: updatedSummary.remainingBalance,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// All bookings
router.get('/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const bookings = await Booking.find(filter).sort({ created_at: -1 })
      .populate('user_id', 'first_name last_name email phone')
      .populate('product_id', 'name image_url type price').lean();
    res.json(bookings.map(b => ({
      ...b,
      id: b._id,
      first_name: b.user_id?.first_name || 'Unknown',
      last_name: b.user_id?.last_name || '',
      email: b.user_id?.email || '',
      phone: b.user_id?.phone || '',
      product_name: b.product_id?.name,
      product_image: b.product_id?.image_url,
      product_type: b.product_id?.type,
      product_price: b.product_id?.price,
      product_is_popular: b.product_id?.is_popular,
      reservation_fee: 0,
      reservation_fee_paid: true,
      reservation_expires_at: null,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update booking status
router.put('/bookings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, admin_notes, pickup_confirmed } = req.body;
    const updates = {};
    if (status) updates.status = status;
    if (admin_notes !== undefined) updates.admin_notes = admin_notes;
    if (pickup_confirmed !== undefined) updates.pickup_confirmed = pickup_confirmed;

    const booking = await Booking.findById(req.params.id).populate('product_id', 'name type is_popular').lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    // If cancelled/completed, release the vehicle back to available
    if (['cancelled', 'completed', 'rejected'].includes(status)) {
      await Product.findByIdAndUpdate(booking.product_id?._id || booking.product_id, { status: 'available' });
    }

    const updated = await Booking.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('product_id', 'name type is_popular').lean();

    res.json({ ...updated, id: updated._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// All customers
router.get('/customers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' }).sort({ created_at: -1 }).select('-password').lean();
    const result = [];
    for (const c of customers) {
      const order_count = await Order.countDocuments({ user_id: c._id });
      const spentAgg = await Payment.aggregate([
        { $match: { user_id: c._id, status: { $in: ['completed', 'pending'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      result.push({ ...c, id: c._id, order_count, total_spent: spentAgg[0]?.total || 0 });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Inventory management
router.get('/inventory', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const allProducts = await Product.find().populate('category_id', 'name').sort({ name: 1 }).lean();
    // Compute times_sold per product
    const soldAgg = await OrderItem.aggregate([
      { $group: { _id: '$product_id', total_sold: { $sum: '$quantity' } } },
    ]);
    const soldMap = {};
    soldAgg.forEach(s => { soldMap[s._id.toString()] = s.total_sold; });

    const products = allProducts.map(p => ({
      ...p,
      id: p._id,
      category_name: p.category_id?.name || null,
      category_id: p.category_id?._id || null,
      times_sold: soldMap[p._id.toString()] || 0,
    }));
    const out_of_stock = products.filter((p) => p.stock_quantity <= 0 || p.status === 'sold_out');
    const low_stock = products.filter((p) => {
      const reorderLevel = Number(p.reorder_level || 5);
      const isOut = p.stock_quantity <= 0 || p.status === 'sold_out';
      return !isOut && p.stock_quantity <= reorderLevel;
    });
    res.json({ products, low_stock, out_of_stock });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Inventory logs (query param based for frontend compatibility)
router.get('/inventory/log', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const filter = req.query.product_id ? { product_id: req.query.product_id } : {};
    const logs = await InventoryLog.find(filter)
      .populate('product_id', 'name')
      .populate('created_by', 'first_name last_name')
      .sort({ created_at: -1 }).lean();
    res.json(logs.map(l => ({ ...l, id: l._id, product_name: l.product_id?.name, first_name: l.created_by?.first_name || 'System' })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Inventory logs by product id (alternative)
router.get('/inventory/:id/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await InventoryLog.find({ product_id: req.params.id })
      .populate('created_by', 'first_name last_name')
      .sort({ created_at: -1 }).lean();
    res.json(logs.map(l => ({ ...l, id: l._id, created_by_name: l.created_by ? `${l.created_by.first_name} ${l.created_by.last_name}` : 'System' })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Sales report
router.get('/sales', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { month, year } = req.query;
    const completedStatuses = ['picked_up', 'delivered', 'completed'];
    const orderFilter = { status: { $in: completedStatuses } };
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      orderFilter.updated_at = { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
    }

    const orders = await Order.find(orderFilter).sort({ updated_at: -1 })
      .populate('user_id', 'first_name last_name').lean();

    const result = [];
    for (const order of orders) {
      const items = await OrderItem.find({ order_id: order._id }).lean();
      const payments = await Payment.find({ order_id: order._id, status: 'completed' }).lean();
      const paid_amount = payments.reduce((sum, p) => sum + p.amount, 0);
      result.push({
        id: order._id,
        order_number: order.order_number,
        created_at: order.created_at,
        completed_at: order.updated_at,
        first_name: order.user_id?.first_name || 'Unknown',
        last_name: order.user_id?.last_name || '',
        total_amount: order.total_amount,
        paid_amount,
        remaining_balance: Math.max(0, (order.total_amount || 0) - paid_amount),
        item_count: items.length,
        payment_method: payments[0]?.payment_method || order.vehicle_payment_method || null,
        delivery_method: order.delivery_method,
        status: order.status,
        notes: order.notes,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// All payments
router.get('/payments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const payments = await Payment.find().sort({ created_at: -1 })
      .populate('order_id', 'order_number')
      .populate('booking_id', 'booking_number')
      .populate('user_id', 'first_name last_name email').lean();
    res.json(payments.map(p => ({
      ...p, id: p._id,
      order_number: p.order_id?.order_number,
      booking_number: p.booking_id?.booking_number,
      customer_name: p.user_id ? `${p.user_id.first_name} ${p.user_id.last_name}` : 'Unknown',
      customer_email: p.user_id?.email,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update payment status
router.put('/payments/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const payment = await Payment.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });

    // If payment completed, update order status
    if (status === 'completed' && payment.order_id) {
      await Order.findByIdAndUpdate(payment.order_id, { status: 'confirmed' });
    }

    res.json({ ...payment, id: payment._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Return requests
router.get('/returns', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const returns = await ReturnRequest.find().sort({ created_at: -1 })
      .populate('user_id', 'first_name last_name email')
      .populate('order_id', 'order_number').lean();

    const result = [];
    for (const r of returns) {
      let product_name = '';
      let quantity = 0;
      if (r.order_item_id) {
        const item = await OrderItem.findById(r.order_item_id).populate('product_id', 'name').lean();
        product_name = item?.product_id?.name || '';
        quantity = item?.quantity || 0;
      }
      result.push({
        ...r,
        id: r._id,
        first_name: r.user_id?.first_name || 'Unknown',
        last_name: r.user_id?.last_name || '',
        email: r.user_id?.email || '',
        order_number: r.order_id?.order_number,
        type: r.request_type || r.type || 'return',
        product_name,
        quantity,
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update return request
router.put('/returns/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    const returnReq = await ReturnRequest.findByIdAndUpdate(
      req.params.id,
      { status, admin_notes },
      { new: true }
    ).lean();
    if (!returnReq) return res.status(404).json({ error: 'Return request not found.' });
    res.json({ ...returnReq, id: returnReq._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// All feedback (admin)
router.get('/feedback', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const feedbacks = await Feedback.find().sort({ created_at: -1 })
      .populate('user_id', 'first_name last_name')
      .populate('product_id', 'name').lean();
    res.json(feedbacks.map(fb => ({
      ...fb,
      id: fb._id,
      first_name: fb.user_id?.first_name || 'Anonymous',
      last_name: fb.user_id?.last_name || '',
      message: fb.comment || fb.message || '',
      product_name: fb.product_id?.name || null,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Respond to feedback (admin)
router.put('/feedback/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { admin_response } = req.body;
    const fb = await Feedback.findByIdAndUpdate(req.params.id, { admin_response, status: 'reviewed' }, { new: true }).lean();
    if (!fb) return res.status(404).json({ error: 'Feedback not found.' });
    res.json({ ...fb, id: fb._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Categories management
router.get('/categories', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    // Attach product count
    for (const cat of categories) {
      cat.product_count = await Product.countDocuments({ category_id: cat._id });
      cat.id = cat._id;
    }
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create category
router.post('/categories', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, type } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required.' });
    const cat = await Category.create({ name, description, type: type || 'general' });
    res.status(201).json({ ...cat.toObject(), id: cat._id });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Category already exists.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update category
router.put('/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, type } = req.body;
    const cat = await Category.findByIdAndUpdate(req.params.id, { name, description, type }, { new: true }).lean();
    if (!cat) return res.status(404).json({ error: 'Category not found.' });
    res.json({ ...cat, id: cat._id });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Category name already in use.' });
    res.status(500).json({ error: 'Server error.' });
  }
});

// Delete category
router.delete('/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const prodCount = await Product.countDocuments({ category_id: req.params.id });
    if (prodCount > 0) return res.status(400).json({ error: 'Cannot delete category with products.' });
    const cat = await Category.findByIdAndDelete(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found.' });
    res.json({ message: 'Category deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Monthly report
router.get('/reports/monthly', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);
    const completedStatuses = ['picked_up', 'delivered', 'completed'];

    // Sales by month based on completed orders
    const monthlyCompletedOrders = await Order.aggregate([
      { $match: { updated_at: { $gte: startDate, $lt: endDate }, status: { $in: completedStatuses } } },
      { $group: { _id: { $month: '$updated_at' }, total_revenue: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sales_by_month = Array.from({ length: 12 }, (_, i) => {
      const found = monthlyCompletedOrders.find(m => m._id === i + 1);
      return { month: monthNames[i], total_revenue: found?.total_revenue || 0, transactions: found?.count || 0 };
    });

    // Bookings by month
    const monthlyBookings = await Booking.aggregate([
      { $match: { created_at: { $gte: startDate, $lt: endDate } } },
      { $group: { _id: { $month: '$created_at' }, total_bookings: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const bookings_by_month = Array.from({ length: 12 }, (_, i) => {
      const found = monthlyBookings.find(m => m._id === i + 1);
      return { month: monthNames[i], total_bookings: found?.total_bookings || 0 };
    });

    // Top products
    const topProducts = await OrderItem.aggregate([
      {
        $lookup: { from: 'orders', localField: 'order_id', foreignField: '_id', as: 'order' }
      },
      { $unwind: '$order' },
      { $match: { 'order.updated_at': { $gte: startDate, $lt: endDate }, 'order.status': { $in: completedStatuses } } },
      { $group: { _id: '$product_id', total_quantity: { $sum: '$quantity' }, total_revenue: { $sum: '$subtotal' } } },
      { $sort: { total_revenue: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { product_id: '$_id', product_name: '$product.name', total_quantity: 1, total_revenue: 1 } },
    ]);

    res.json({ sales_by_month, bookings_by_month, top_products: topProducts });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Revenue report
router.get('/reports/revenue', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const completedStatuses = ['picked_up', 'delivered', 'completed'];

    // Total revenue from completed orders
    const totalRevenueAgg = await Order.aggregate([
      { $match: { status: { $in: completedStatuses } } },
      { $group: { _id: null, total: { $sum: '$total_amount' } } },
    ]);
    const total_revenue = totalRevenueAgg[0]?.total || 0;

    // Monthly revenue from completed orders
    const monthlyRevenueAgg = await Order.aggregate([
      { $match: { status: { $in: completedStatuses }, updated_at: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$total_amount' } } },
    ]);
    const monthly_revenue = monthlyRevenueAgg[0]?.total || 0;

    // Total completed orders
    const total_orders = await Order.countDocuments({ status: { $in: completedStatuses } });

    // Revenue by payment method
    const revenueByMethod = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$payment_method', total: { $sum: '$amount' } } },
    ]);
    const revenue_by_method = revenueByMethod.map(r => ({ payment_method: r._id || 'unknown', total: r.total }));

    // Revenue by product type
    const revenueByType = await OrderItem.aggregate([
      { $lookup: { from: 'orders', localField: 'order_id', foreignField: '_id', as: 'order' } },
      { $unwind: '$order' },
      { $match: { 'order.status': { $in: completedStatuses } } },
      { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: { _id: '$product.type', total: { $sum: '$subtotal' } } },
    ]);
    const revenue_by_type = revenueByType.map(r => ({ type: r._id || 'other', total: r.total }));

    // Daily revenue from completed orders (last 30 days)
    const dailyRevenueAgg = await Order.aggregate([
      { $match: { status: { $in: completedStatuses }, updated_at: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updated_at' } }, total: { $sum: '$total_amount' } } },
      { $sort: { _id: 1 } },
    ]);
    const daily_revenue = dailyRevenueAgg.map(d => ({ date: d._id, total: d.total }));

    res.json({ total_revenue, monthly_revenue, total_orders, revenue_by_method, revenue_by_type, daily_revenue });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ──────────────────────────────────────────────
// VEHICLE INQUIRY MANAGEMENT (Admin)
// ──────────────────────────────────────────────

// GET /admin/inquiries — List all inquiries with optional status filter
router.get('/inquiries', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const inquiries = await VehicleInquiry.find(filter)
      .populate('user_id', 'first_name last_name email phone')
      .populate('product_id', 'name image_url vehicle_category price')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(inquiries);
  } catch (err) {
    console.error('Admin get inquiries error:', err);
    return res.status(500).json({ error: 'Failed to fetch inquiries' });
  }
});

// PUT /admin/inquiries/:id — Update inquiry status (approve / reject)
router.put('/inquiries/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    const allowed = ['approved', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    }

    const inquiry = await VehicleInquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });
    if (inquiry.status === 'converted') {
      return res.status(400).json({ error: 'Converted inquiries cannot be modified' });
    }

    inquiry.status = status;
    if (admin_notes !== undefined) inquiry.admin_notes = admin_notes;
    await inquiry.save();

    await inquiry.populate('user_id', 'first_name last_name email');
    await inquiry.populate('product_id', 'name image_url vehicle_category price');

    return res.json(inquiry);
  } catch (err) {
    console.error('Admin update inquiry error:', err);
    return res.status(500).json({ error: 'Failed to update inquiry' });
  }
});

module.exports = router;
