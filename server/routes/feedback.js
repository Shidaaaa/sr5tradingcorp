const express = require('express');
const Feedback = require('../models/Feedback');
const ReturnRequest = require('../models/ReturnRequest');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

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
      .populate('order_id', 'order_number')
      .sort({ created_at: -1 }).lean();
    res.json(returns.map(r => ({ ...r, id: r._id, order_number: r.order_id?.order_number })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Submit return request (customer)
router.post('/returns', authenticateToken, async (req, res) => {
  try {
    const { order_id, order_item_id, reason, request_type } = req.body;
    if (!order_id || !reason) return res.status(400).json({ error: 'Order ID and reason required.' });
    const returnReq = await ReturnRequest.create({
      order_id, order_item_id: order_item_id || null,
      user_id: req.user.id, reason, request_type: request_type || 'return',
    });
    res.status(201).json({ ...returnReq.toObject(), id: returnReq._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Handle return request (admin update)
router.put('/returns/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    const returnReq = await ReturnRequest.findByIdAndUpdate(
      req.params.id, { status, admin_notes }, { new: true }
    ).lean();
    if (!returnReq) return res.status(404).json({ error: 'Return request not found.' });
    res.json({ ...returnReq, id: returnReq._id });
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
