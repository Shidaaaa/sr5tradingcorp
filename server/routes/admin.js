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
