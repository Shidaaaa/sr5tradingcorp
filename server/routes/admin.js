const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
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
const InstallmentPlan = require('../models/InstallmentPlan');
const InstallmentSchedule = require('../models/InstallmentSchedule');
const { calculateInstallmentBreakdown, generateReceiptNumber } = require('../utils/helpers');

const router = express.Router();
const ADMIN_INSTORE_PAYMENT_METHODS = ['cash', 'bank_transfer', 'credit_card', 'debit_card'];
const paymentReceiptDir = path.join(__dirname, '..', 'uploads', 'payment-receipts');

if (!fs.existsSync(paymentReceiptDir)) {
  fs.mkdirSync(paymentReceiptDir, { recursive: true });
}

const uploadReceiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, paymentReceiptDir),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `receipt-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const uploadReceipt = multer({
  storage: uploadReceiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) {
      return cb(createHttpError(400, 'Receipt file must be JPG, PNG, WEBP, or PDF.'));
    }
    cb(null, true);
  },
});

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeReferenceNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function assertValidAdminPaymentMethod(method) {
  if (!ADMIN_INSTORE_PAYMENT_METHODS.includes(method)) {
    throw createHttpError(400, 'Invalid payment method for admin-recorded in-store payment.');
  }
}

function assertOrderPayable(order) {
  if (!order) throw createHttpError(404, 'Order not found.');
  if (['cancelled', 'returned', 'replaced'].includes(order.status)) {
    throw createHttpError(400, `Cannot record payment for order status ${order.status}.`);
  }
}

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function addMonths(baseDate, monthsToAdd) {
  const date = new Date(baseDate);
  date.setMonth(date.getMonth() + monthsToAdd);
  return date;
}

function getPublicBaseUrl(req) {
  const configured = (process.env.PUBLIC_BASE_URL || '').trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/$/, '');
  }

  const host = req.get('host');
  return `${req.protocol}://${host}`.replace(/\/$/, '');
}

function requireReceiptImageForManualPayment(receiptImageUrl) {
  if (!receiptImageUrl || typeof receiptImageUrl !== 'string' || !receiptImageUrl.trim()) {
    throw createHttpError(400, 'Please upload a receipt image or PDF before recording this payment.');
  }
}

// Upload payment receipt proof (image/pdf) for admin-recorded payments
router.post('/payments/upload-receipt', authenticateToken, requireAdmin, (req, res) => {
  uploadReceipt.single('receipt')(req, res, (err) => {
    if (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Receipt file is too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ error: err.message || 'Invalid receipt upload.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Receipt file is required.' });
    }

    const relativePath = `/uploads/payment-receipts/${req.file.filename}`;
    const absoluteUrl = `${getPublicBaseUrl(req)}${relativePath}`;
    return res.status(201).json({
      message: 'Receipt uploaded successfully.',
      receipt_image_url: absoluteUrl,
      receipt_image_path: relativePath,
    });
  });
});

async function markOverdueScheduleRows(installmentPlanId) {
  await InstallmentSchedule.updateMany(
    {
      installment_plan_id: installmentPlanId,
      status: { $in: ['pending', 'partially_paid'] },
      due_date: { $lt: new Date() },
    },
    { status: 'overdue' }
  );
}

async function getPlanWithSchedule(orderId) {
  const plan = await InstallmentPlan.findOne({ order_id: orderId }).lean();
  if (!plan) return null;

  await markOverdueScheduleRows(plan._id);
  const schedule = await InstallmentSchedule.find({ installment_plan_id: plan._id })
    .sort({ installment_number: 1 })
    .lean();

  return {
    ...plan,
    id: plan._id,
    schedule: schedule.map(row => ({
      ...row,
      id: row._id,
    })),
  };
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

// Dashboard stats
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalProducts, totalOrders, pendingOrders, completedOrders, totalCustomers, totalBookings, pendingBookings, pendingFeedback, pendingReturns, soldOutProducts, lowStockProducts] = await Promise.all([
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
      Product.countDocuments({ stock_quantity: { $lte: 5 }, type: { $ne: 'vehicle' } }),
    ]);

    const totalRevenueResult = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const monthlyRevenueResult = await Payment.aggregate([
      { $match: { status: 'completed', created_at: { $gte: monthStart } } },
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
      order.items = items.map(i => ({ id: i._id, name: i.product_id?.name, product_image: i.product_id?.image_url, quantity: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal }));
      const payments = await Payment.find({ order_id: order._id, status: { $in: ['completed', 'pending'] } }).lean();
      order.payments = payments.map(p => ({ id: p._id, amount: p.amount, payment_method: p.payment_method, payment_type: p.payment_type, status: p.status, created_at: p.created_at }));
      const totalPaid = getUniqueCompletedPaymentTotal(payments);
      order.id = order._id;
      order.first_name = order.user_id?.first_name || 'Unknown';
      order.last_name = order.user_id?.last_name || '';
      order.email = order.user_id?.email || '';
      order.total_paid = totalPaid;
      order.remaining_balance = Math.max(0, (order.total_amount || 0) - totalPaid);

      const installment = await getPlanWithSchedule(order._id);
      order.installment_plan = installment;
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update order status
router.put('/orders/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    res.json({ ...order, id: order._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Setup installment plan for an order
router.post('/orders/:id/setup-installment', authenticateToken, requireAdmin, async (req, res) => {
  const session = await Order.startSession();
  try {
    await session.startTransaction();

    const order = await Order.findById(req.params.id).session(session);
    assertOrderPayable(order);
    if (!order.has_vehicle) throw createHttpError(400, 'Installment is only available for vehicle orders.');
    if (!order.reservation_fee_paid) throw createHttpError(400, 'Reservation fee must be paid before setting up installment.');
    if (order.payment_method === 'full') throw createHttpError(400, 'Order is already marked for full payment.');

    const existingPlan = await InstallmentPlan.findOne({ order_id: order._id }).session(session);
    if (existingPlan) throw createHttpError(409, 'Installment plan already exists for this order.');

    const completedPayments = await Payment.find({ order_id: order._id, status: 'completed' }).session(session).lean();
    const totalPaid = getUniqueCompletedPaymentTotal(completedPayments);
    const remainingBalance = roundCurrency(Math.max(0, (order.total_amount || 0) - totalPaid));
    if (remainingBalance <= 0) throw createHttpError(400, 'Order has no remaining balance.');

    const breakdown = calculateInstallmentBreakdown(remainingBalance, {
      downPaymentRate: 0.5,
      numberOfInstallments: 12,
      interestRate: 0.01,
    });

    const startDate = req.body.start_date ? new Date(req.body.start_date) : new Date();
    if (Number.isNaN(startDate.getTime())) throw createHttpError(400, 'Invalid start date.');

    const [plan] = await InstallmentPlan.create([{
      order_id: order._id,
      user_id: order.user_id,
      total_financed_amount: breakdown.financedAmount,
      down_payment_amount: breakdown.downPaymentAmount,
      down_payment_paid: false,
      number_of_installments: breakdown.numberOfInstallments,
      monthly_amount: breakdown.monthlyAmount,
      interest_rate: breakdown.interestRate,
      total_with_interest: breakdown.totalWithInterest,
      status: 'pending',
      start_date: null,
    }], { session });

    const scheduleRows = [];
    for (let i = 1; i <= breakdown.numberOfInstallments; i += 1) {
      scheduleRows.push({
        installment_plan_id: plan._id,
        installment_number: i,
        amount_due: breakdown.monthlyAmount,
        amount_paid: 0,
        due_date: addMonths(startDate, i),
        status: 'pending',
      });
    }
    await InstallmentSchedule.insertMany(scheduleRows, { session });

    order.payment_method = 'installment';
    order.status = 'installment_active';
    await order.save({ session });

    await session.commitTransaction();

    const installment = await getPlanWithSchedule(order._id);
    res.status(201).json({
      message: 'Installment plan created.',
      order_id: order._id,
      installment_plan: installment,
      remaining_balance: remainingBalance,
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Server error setting up installment.' });
  } finally {
    await session.endSession();
  }
});

// Record admin payment for full settlement or down payment
router.post('/orders/:id/record-payment', authenticateToken, requireAdmin, async (req, res) => {
  const session = await Order.startSession();
  try {
    const { amount, payment_method, reference_number, payment_type, receipt_image_url } = req.body;
    if (!amount || Number(amount) <= 0) throw createHttpError(400, 'Valid payment amount is required.');
    if (!payment_method) throw createHttpError(400, 'Payment method is required.');
    if (!['full', 'down_payment'].includes(payment_type)) throw createHttpError(400, 'payment_type must be full or down_payment.');

    assertValidAdminPaymentMethod(payment_method);
    requireReceiptImageForManualPayment(receipt_image_url);
    const normalizedReference = normalizeReferenceNumber(reference_number);
    if (payment_method !== 'cash' && !normalizedReference) {
      throw createHttpError(400, 'Reference number is required for non-cash payments.');
    }

    await session.startTransaction();

    const order = await Order.findById(req.params.id).session(session);
    assertOrderPayable(order);

    const completedPayments = await Payment.find({ order_id: order._id, status: 'completed' }).session(session).lean();
    const totalPaid = getUniqueCompletedPaymentTotal(completedPayments);
    const remainingBalance = roundCurrency(Math.max(0, (order.total_amount || 0) - totalPaid));
    const normalizedAmount = roundCurrency(Number(amount));

    if (payment_type === 'full') {
      if (normalizedAmount > remainingBalance) throw createHttpError(400, 'Payment amount cannot exceed remaining balance.');

      if (normalizedReference) {
        const existing = await Payment.findOne({
          order_id: order._id,
          payment_type: 'full',
          reference_number: normalizedReference,
          status: 'completed',
        }).session(session).lean();
        if (existing) throw createHttpError(409, 'A full payment with this reference number already exists for this order.');
      }

      const [payment] = await Payment.create([{
        order_id: order._id,
        user_id: order.user_id,
        amount: normalizedAmount,
        payment_method,
        payment_type: 'full',
        reference_number: normalizedReference,
        status: 'completed',
        receipt_number: generateReceiptNumber(),
        receipt_image_url: receipt_image_url.trim(),
      }], { session });

      const updatedPaid = roundCurrency(totalPaid + normalizedAmount);
      const updatedRemaining = roundCurrency(Math.max(0, (order.total_amount || 0) - updatedPaid));

      order.payment_method = 'full';
      order.status = updatedRemaining <= 0 ? 'completed' : 'confirmed';
      await order.save({ session });

      await session.commitTransaction();
      return res.status(201).json({
        message: 'Full payment recorded.',
        payment: { ...payment.toObject(), id: payment._id },
        remaining_balance: updatedRemaining,
      });
    }

    const plan = await InstallmentPlan.findOne({ order_id: order._id }).session(session);
    if (!plan) throw createHttpError(404, 'Installment plan not found for this order.');
    if (plan.down_payment_paid) throw createHttpError(400, 'Down payment is already recorded.');

    if (Math.abs(normalizedAmount - roundCurrency(plan.down_payment_amount)) > 0.01) {
      throw createHttpError(400, `Down payment must be exactly ${plan.down_payment_amount}.`);
    }

    const paymentDate = req.body.payment_date ? new Date(req.body.payment_date) : new Date();
    if (Number.isNaN(paymentDate.getTime())) throw createHttpError(400, 'Invalid payment date.');

    if (normalizedReference) {
      const existing = await Payment.findOne({
        order_id: order._id,
        payment_type: 'down_payment',
        reference_number: normalizedReference,
        status: 'completed',
      }).session(session).lean();
      if (existing) throw createHttpError(409, 'A down payment with this reference number already exists for this order.');
    }

    const [payment] = await Payment.create([{
      order_id: order._id,
      user_id: order.user_id,
      amount: normalizedAmount,
      payment_method,
      payment_type: 'down_payment',
      reference_number: normalizedReference,
      status: 'completed',
      receipt_number: generateReceiptNumber(),
      receipt_image_url: receipt_image_url.trim(),
    }], { session });

    plan.down_payment_paid = true;
    plan.start_date = paymentDate;
    plan.status = 'active';
    await plan.save({ session });

    const existingSchedule = await InstallmentSchedule.find({ installment_plan_id: plan._id }).session(session).sort({ installment_number: 1 });
    for (const row of existingSchedule) {
      row.due_date = addMonths(paymentDate, row.installment_number);
      if (row.status !== 'paid') {
        row.status = row.due_date < new Date() ? 'overdue' : 'pending';
      }
      await row.save({ session });
    }

    order.payment_method = 'installment';
    order.status = 'installment_active';
    await order.save({ session });

    await session.commitTransaction();
    return res.status(201).json({
      message: 'Down payment recorded and installment plan activated.',
      payment: { ...payment.toObject(), id: payment._id },
      installment_plan: { ...plan.toObject(), id: plan._id },
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Server error recording payment.' });
  } finally {
    await session.endSession();
  }
});

// Record monthly installment payment
router.post('/installments/:planId/record-payment', authenticateToken, requireAdmin, async (req, res) => {
  const session = await Order.startSession();
  try {
    const { installment_number, amount, payment_method, reference_number, receipt_image_url } = req.body;
    const installmentNumber = Number(installment_number);
    if (!Number.isInteger(installmentNumber) || installmentNumber <= 0) throw createHttpError(400, 'installment_number must be a valid positive integer.');
    if (!amount || Number(amount) <= 0) throw createHttpError(400, 'Valid amount is required.');
    if (!payment_method) throw createHttpError(400, 'payment_method is required.');

    assertValidAdminPaymentMethod(payment_method);
    requireReceiptImageForManualPayment(receipt_image_url);
    const normalizedReference = normalizeReferenceNumber(reference_number);
    if (payment_method !== 'cash' && !normalizedReference) {
      throw createHttpError(400, 'Reference number is required for non-cash payments.');
    }

    await session.startTransaction();

    const plan = await InstallmentPlan.findById(req.params.planId).session(session);
    if (!plan) throw createHttpError(404, 'Installment plan not found.');
    if (!plan.down_payment_paid) throw createHttpError(400, 'Down payment must be recorded before monthly payments.');
    if (!['active', 'pending', 'defaulted'].includes(plan.status)) {
      throw createHttpError(400, `Cannot record payment for plan status ${plan.status}.`);
    }

    await InstallmentSchedule.updateMany(
      {
        installment_plan_id: plan._id,
        status: { $in: ['pending', 'partially_paid'] },
        due_date: { $lt: new Date() },
      },
      { status: 'overdue' },
      { session }
    );

    const firstUnpaid = await InstallmentSchedule.findOne({
      installment_plan_id: plan._id,
      status: { $ne: 'paid' },
    }).session(session).sort({ installment_number: 1 });

    if (firstUnpaid && installmentNumber !== firstUnpaid.installment_number) {
      throw createHttpError(400, `Installments must be paid in order. Next payable installment is #${firstUnpaid.installment_number}.`);
    }

    const row = await InstallmentSchedule.findOne({
      installment_plan_id: plan._id,
      installment_number: installmentNumber,
    }).session(session);
    if (!row) throw createHttpError(404, 'Installment schedule row not found.');
    if (row.status === 'paid') throw createHttpError(400, 'This installment is already paid.');

    const amountToApply = roundCurrency(Number(amount));
    const dueLeft = roundCurrency((row.amount_due || 0) - (row.amount_paid || 0));
    if (amountToApply > dueLeft) throw createHttpError(400, `Amount exceeds remaining due for installment #${installmentNumber}.`);

    if (normalizedReference) {
      const existing = await Payment.findOne({
        order_id: plan.order_id,
        payment_type: 'installment',
        installment_number: installmentNumber,
        reference_number: normalizedReference,
        status: 'completed',
      }).session(session).lean();
      if (existing) throw createHttpError(409, 'A payment with this reference already exists for this installment number.');
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
      user_id: plan.user_id,
      amount: amountToApply,
      payment_method,
      payment_type: 'installment',
      reference_number: normalizedReference,
      status: 'completed',
      receipt_number: generateReceiptNumber(),
      receipt_image_url: receipt_image_url.trim(),
      installment_number: row.installment_number,
      total_installments: plan.number_of_installments,
    }], { session });

    const remainingRows = await InstallmentSchedule.countDocuments({
      installment_plan_id: plan._id,
      status: { $ne: 'paid' },
    }).session(session);

    const linkedOrder = await Order.findById(plan.order_id).session(session);
    assertOrderPayable(linkedOrder);

    if (remainingRows === 0) {
      plan.status = 'completed';
      linkedOrder.status = 'completed';
    } else {
      plan.status = 'active';
      linkedOrder.status = 'installment_active';
    }
    linkedOrder.payment_method = 'installment';

    await plan.save({ session });
    await linkedOrder.save({ session });
    await session.commitTransaction();

    res.status(201).json({
      message: 'Installment payment recorded.',
      payment: { ...payment.toObject(), id: payment._id },
      schedule: { ...row.toObject(), id: row._id },
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    if (err.status) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Server error recording installment payment.' });
  } finally {
    await session.endSession();
  }
});

// Get installment plan and schedule for an order
router.get('/installments/:orderId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const installment = await getPlanWithSchedule(order._id);
    if (!installment) return res.status(404).json({ error: 'Installment plan not found for this order.' });

    res.json({
      order_id: order._id,
      order_number: order.order_number,
      installment_plan: installment,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error loading installment details.' });
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
      reservation_fee: b.reservation_fee || 0,
      reservation_fee_paid: b.reservation_fee_paid || false,
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
        { $match: { user_id: c._id, status: 'completed' } },
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
    const low_stock = products.filter(p => p.type !== 'vehicle' && p.stock_quantity > 0 && p.stock_quantity <= (p.reorder_level || 5));
    const out_of_stock = products.filter(p => p.stock_quantity <= 0 || p.status === 'sold_out');
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
    let dateFilter = {};
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      dateFilter = { created_at: { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) } };
    }

    const orders = await Order.find(dateFilter).sort({ created_at: -1 })
      .populate('user_id', 'first_name last_name').lean();

    const result = [];
    for (const order of orders) {
      const items = await OrderItem.find({ order_id: order._id }).lean();
      const payments = await Payment.find({ order_id: order._id, status: { $in: ['completed', 'pending'] } }).lean();
      const paid_amount = getUniqueCompletedPaymentTotal(payments);
      result.push({
        id: order._id,
        order_number: order.order_number,
        created_at: order.created_at,
        first_name: order.user_id?.first_name || 'Unknown',
        last_name: order.user_id?.last_name || '',
        total_amount: order.total_amount,
        paid_amount,
        remaining_balance: Math.max(0, (order.total_amount || 0) - paid_amount),
        item_count: items.length,
        payment_method: payments[0]?.payment_method || null,
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

    // Sales by month
    const monthlyPayments = await Payment.aggregate([
      { $match: { created_at: { $gte: startDate, $lt: endDate }, status: 'completed' } },
      { $group: { _id: { $month: '$created_at' }, total_revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sales_by_month = Array.from({ length: 12 }, (_, i) => {
      const found = monthlyPayments.find(m => m._id === i + 1);
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
      { $match: { 'order.created_at': { $gte: startDate, $lt: endDate } } },
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

    // Total revenue
    const totalRevenueAgg = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const total_revenue = totalRevenueAgg[0]?.total || 0;

    // Monthly revenue
    const monthlyRevenueAgg = await Payment.aggregate([
      { $match: { status: 'completed', created_at: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const monthly_revenue = monthlyRevenueAgg[0]?.total || 0;

    // Total orders
    const total_orders = await Order.countDocuments();

    // Revenue by payment method
    const revenueByMethod = await Payment.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$payment_method', total: { $sum: '$amount' } } },
    ]);
    const revenue_by_method = revenueByMethod.map(r => ({ payment_method: r._id || 'unknown', total: r.total }));

    // Revenue by product type
    const revenueByType = await OrderItem.aggregate([
      { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $group: { _id: '$product.type', total: { $sum: '$subtotal' } } },
    ]);
    const revenue_by_type = revenueByType.map(r => ({ type: r._id || 'other', total: r.total }));

    // Daily revenue (last 30 days)
    const dailyRevenueAgg = await Payment.aggregate([
      { $match: { status: 'completed', created_at: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } }, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]);
    const daily_revenue = dailyRevenueAgg.map(d => ({ date: d._id, total: d.total }));

    res.json({ total_revenue, monthly_revenue, total_orders, revenue_by_method, revenue_by_type, daily_revenue });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
