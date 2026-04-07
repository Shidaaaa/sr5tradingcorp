const express = require('express');
const Feedback = require('../models/Feedback');
const ReturnRequest = require('../models/ReturnRequest');
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const InventoryLog = require('../models/InventoryLog');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

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

// Get user feedback
router.get('/', authenticateToken, async (req, res) => {
  try {
    const feedback = await Feedback.find({ user_id: req.user.id })
      .populate('product_id', 'name image_url')
      .populate('order_id', 'order_number')
      .sort({ created_at: -1 })
      .lean();
    res.json(feedback.map(f => ({
      ...f,
      id: f._id,
      product_name: f.product_id?.name,
      product_image: f.product_id?.image_url,
      order_number: f.order_id?.order_number,
      product_id: f.product_id?._id,
      order_id: f.order_id?._id,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create feedback
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { product_id, order_id, rating, comment, type } = req.body;
    if (!rating) return res.status(400).json({ error: 'Rating is required.' });

    const fb = await Feedback.create({
      user_id: req.user.id,
      product_id: product_id || null,
      order_id: order_id || null,
      rating,
      comment: comment || null,
      type: type || 'general',
      status: 'pending',
    });
    res.status(201).json({ ...fb.toObject(), id: fb._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating feedback.' });
  }
});

// Admin: Get all feedback
router.get('/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const feedback = await Feedback.find()
      .populate('user_id', 'first_name last_name email')
      .populate('product_id', 'name')
      .populate('order_id', 'order_number')
      .sort({ created_at: -1 })
      .lean();
    res.json(feedback.map(f => ({
      ...f,
      id: f._id,
      customer_name: f.user_id ? `${f.user_id.first_name} ${f.user_id.last_name}` : 'Unknown',
      customer_email: f.user_id?.email,
      product_name: f.product_id?.name,
      order_number: f.order_id?.order_number,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get return requests (customer) - MUST be before /:id routes
router.get('/returns', authenticateToken, async (req, res) => {
  try {
    const returns = await ReturnRequest.find({ user_id: req.user.id })
      .populate('order_id', 'order_number status')
      .populate('order_item_id', 'quantity subtotal unit_price')
      .sort({ created_at: -1 }).lean();

    const itemIds = returns.map(r => r.order_item_id?._id || r.order_item_id).filter(Boolean);
    const orderItems = itemIds.length
      ? await OrderItem.find({ _id: { $in: itemIds } }).populate('product_id', 'name').lean()
      : [];
    const itemMap = {};
    orderItems.forEach(item => { itemMap[String(item._id)] = item; });

    res.json(returns.map(r => {
      const item = r.order_item_id?._id ? r.order_item_id : itemMap[String(r.order_item_id)];
      return {
        ...r,
        id: r._id,
        order_id: r.order_id?._id || r.order_id,
        order_number: r.order_id?.order_number,
        order_status: r.order_id?.status || null,
        order_item_id: item?._id || r.order_item_id,
        product_name: item?.product_id?.name || null,
        quantity: item?.quantity || 0,
        unit_price: item?.unit_price || 0,
        subtotal: item?.subtotal || 0,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Submit return request (customer)
router.post('/returns', authenticateToken, async (req, res) => {
  try {
    const { order_id, order_item_id, reason, request_type } = req.body;

    if (!order_id || !order_item_id || !reason) {
      return res.status(400).json({ error: 'Order, order item, and reason are required.' });
    }

    const normalizedType = request_type === 'replacement' ? 'replacement' : 'return';

    const order = await Order.findOne({ _id: order_id, user_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    if (!['delivered', 'completed', 'return_requested'].includes(order.status)) {
      return res.status(400).json({ error: 'Only delivered or completed orders can request return/replacement.' });
    }

    if (!order.customer_received_at) {
      return res.status(400).json({ error: 'Order must be confirmed as received before return/replacement requests.' });
    }

    const daysSinceReceived = Math.floor((Date.now() - new Date(order.customer_received_at).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceReceived > 7) {
      return res.status(400).json({ error: 'Return/replacement requests are only allowed within 7 days after receiving the order.' });
    }

    const completedPayments = await Payment.find({ order_id, status: 'completed' }).lean();
    const totalPaid = getUniqueCompletedPaymentTotal(completedPayments);
    if (Number(totalPaid || 0) + 0.01 < Number(order.total_amount || 0)) {
      return res.status(400).json({ error: 'Order must be fully paid before return/replacement requests.' });
    }

    const orderItem = await OrderItem.findOne({ _id: order_item_id, order_id }).populate('product_id', 'name type').lean();
    if (!orderItem) return res.status(404).json({ error: 'Order item not found for this order.' });

    if (!['parts', 'tools'].includes(orderItem.product_id?.type)) {
      return res.status(400).json({ error: 'Return/replacement requests are only available for Parts & Accessories and Tools & Equipment items.' });
    }

    const existingOpen = await ReturnRequest.findOne({
      order_id,
      order_item_id,
      user_id: req.user.id,
      status: { $in: ['pending', 'approved'] },
    }).lean();

    if (existingOpen) {
      return res.status(409).json({ error: 'An open return/replacement request already exists for this item.' });
    }

    const returnReq = await ReturnRequest.create({
      order_id,
      order_item_id,
      user_id: req.user.id,
      reason: String(reason).trim(),
      request_type: normalizedType,
      status: 'pending',
    });

    await Order.findByIdAndUpdate(order_id, { status: 'return_requested' });

    res.status(201).json({ ...returnReq.toObject(), id: returnReq._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Handle return request (admin update)
router.put('/returns/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid return request status.' });
    }

    const returnReq = await ReturnRequest.findById(req.params.id);
    if (!returnReq) return res.status(404).json({ error: 'Return request not found.' });

    const order = await Order.findById(returnReq.order_id);
    if (!order) return res.status(404).json({ error: 'Linked order not found.' });

    const orderItem = returnReq.order_item_id ? await OrderItem.findById(returnReq.order_item_id).lean() : null;

    if (status === 'approved') {
      returnReq.status = 'approved';
      returnReq.admin_notes = admin_notes || null;
      await returnReq.save();
      if (order.status !== 'returned' && order.status !== 'replaced') {
        order.status = 'return_requested';
        await order.save();
      }
    }

    if (status === 'rejected') {
      returnReq.status = 'rejected';
      returnReq.admin_notes = admin_notes || null;
      await returnReq.save();

      const otherOpen = await ReturnRequest.countDocuments({
        order_id: returnReq.order_id,
        _id: { $ne: returnReq._id },
        status: { $in: ['pending', 'approved'] },
      });
      if (otherOpen === 0 && order.status === 'return_requested') {
        order.status = 'completed';
        await order.save();
      }
    }

    if (status === 'completed') {
      if (returnReq.status !== 'approved') {
        return res.status(400).json({ error: 'Request must be approved before marking as completed.' });
      }
      if (!orderItem) {
        return res.status(400).json({ error: 'Order item is required to complete this request.' });
      }

      if (returnReq.request_type === 'return') {
        const product = await Product.findById(orderItem.product_id);
        if (product) {
          const prevQty = Number(product.stock_quantity || 0);
          product.stock_quantity = prevQty + Number(orderItem.quantity || 0);
          if (product.stock_quantity > 0 && product.status === 'sold_out') product.status = 'available';
          await product.save();

          await InventoryLog.create({
            product_id: product._id,
            change_type: 'restock',
            quantity_change: Number(orderItem.quantity || 0),
            previous_quantity: prevQty,
            new_quantity: product.stock_quantity,
            notes: `Return request completed (${returnReq._id})`,
            created_by: req.user.id,
          });
        }
        order.status = 'returned';
      } else {
        order.status = 'replaced';
      }

      returnReq.status = 'completed';
      returnReq.admin_notes = admin_notes || returnReq.admin_notes || null;
      await Promise.all([returnReq.save(), order.save()]);
    }

    const updated = await ReturnRequest.findById(req.params.id).lean();
    res.json({ ...updated, id: updated._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Admin: Respond to feedback - MUST be after /returns routes
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { admin_response, status } = req.body;
    const fb = await Feedback.findByIdAndUpdate(
      req.params.id,
      { admin_response, status: status || 'reviewed' },
      { new: true }
    ).lean();
    if (!fb) return res.status(404).json({ error: 'Feedback not found.' });
    res.json({ ...fb, id: fb._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
