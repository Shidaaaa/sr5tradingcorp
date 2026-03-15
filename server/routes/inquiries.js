const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../middleware/auth');
const VehicleInquiry = require('../models/VehicleInquiry');
const Product = require('../models/Product');
const { generateInquiryNumber } = require('../utils/helpers');

const router = express.Router();

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// Single installment plan available: 50% down, 12 months, 1% monthly interest
const INSTALLMENT_PLAN = {
  id: 'vehicle_50_12_1',
  label: '50% Downpayment • 12 Months • 1% Monthly Interest',
  downpaymentRate: 0.5,
  months: 12,
  interestRate: 0.01,
};

function computeInstallmentBreakdown(price) {
  const downpayment = roundCurrency(price * INSTALLMENT_PLAN.downpaymentRate);
  const financed = roundCurrency(price - downpayment);
  const totalInterest = roundCurrency(financed * INSTALLMENT_PLAN.interestRate * INSTALLMENT_PLAN.months);
  const totalAmount = roundCurrency(price + totalInterest);
  const monthly = roundCurrency((financed * (1 + INSTALLMENT_PLAN.interestRate * INSTALLMENT_PLAN.months)) / INSTALLMENT_PLAN.months);
  return { downpayment, financed, totalInterest, totalAmount, monthly };
}

// POST /api/inquiries — Submit a vehicle installment inquiry
router.post('/', inquiryLimiter, authenticateToken, async (req, res) => {
  try {
    const { product_id, preferred_payment_method = 'installment', notes } = req.body;

    if (!product_id) return res.status(400).json({ error: 'product_id is required' });

    const product = await Product.findById(product_id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.type !== 'vehicle') return res.status(400).json({ error: 'Installment inquiries are only available for vehicles' });
    if (product.status !== 'available') return res.status(400).json({ error: 'This vehicle is no longer available' });

    // Prevent duplicate pending/approved inquiries for the same vehicle by the same user
    const existing = await VehicleInquiry.findOne({
      user_id: req.user.id,
      product_id,
      status: { $in: ['pending', 'approved'] },
    });
    if (existing) {
      return res.status(400).json({ error: 'You already have an active inquiry for this vehicle', inquiry_id: existing._id });
    }

    const breakdown = computeInstallmentBreakdown(product.price);

    const inquiry = new VehicleInquiry({
      user_id: req.user.id,
      product_id,
      inquiry_number: generateInquiryNumber(),
      preferred_payment_method,
      product_price: product.price,
      downpayment_amount: preferred_payment_method === 'installment' ? breakdown.downpayment : null,
      financed_amount: preferred_payment_method === 'installment' ? breakdown.financed : null,
      monthly_amount: preferred_payment_method === 'installment' ? breakdown.monthly : null,
      total_amount: preferred_payment_method === 'installment' ? breakdown.totalAmount : product.price,
      installment_plan_name: preferred_payment_method === 'installment' ? INSTALLMENT_PLAN.label : null,
      installment_months: preferred_payment_method === 'installment' ? INSTALLMENT_PLAN.months : null,
      installment_interest_rate: preferred_payment_method === 'installment' ? INSTALLMENT_PLAN.interestRate : null,
      notes,
    });

    await inquiry.save();
    await inquiry.populate('product_id', 'name image_url vehicle_category price');

    return res.status(201).json(inquiry);
  } catch (err) {
    console.error('Create inquiry error:', err);
    return res.status(500).json({ error: 'Failed to submit inquiry' });
  }
});

// GET /api/inquiries — List current user's inquiries
router.get('/', inquiryLimiter, authenticateToken, async (req, res) => {
  try {
    const inquiries = await VehicleInquiry.find({ user_id: req.user.id })
      .populate('product_id', 'name image_url vehicle_category price status')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(inquiries);
  } catch (err) {
    console.error('Get inquiries error:', err);
    return res.status(500).json({ error: 'Failed to fetch inquiries' });
  }
});

// GET /api/inquiries/:id — Get single inquiry (owner only)
router.get('/:id', inquiryLimiter, authenticateToken, async (req, res) => {
  try {
    const inquiry = await VehicleInquiry.findOne({ _id: req.params.id, user_id: req.user.id })
      .populate('product_id', 'name image_url vehicle_category price status description specifications')
      .populate('converted_order_id', 'order_number status')
      .lean();

    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });
    return res.json(inquiry);
  } catch (err) {
    console.error('Get inquiry error:', err);
    return res.status(500).json({ error: 'Failed to fetch inquiry' });
  }
});

// DELETE /api/inquiries/:id — Cancel a pending inquiry
router.delete('/:id', inquiryLimiter, authenticateToken, async (req, res) => {
  try {
    const inquiry = await VehicleInquiry.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found' });
    if (inquiry.status !== 'pending') return res.status(400).json({ error: 'Only pending inquiries can be cancelled' });

    inquiry.status = 'cancelled';
    await inquiry.save();
    return res.json({ message: 'Inquiry cancelled' });
  } catch (err) {
    console.error('Cancel inquiry error:', err);
    return res.status(500).json({ error: 'Failed to cancel inquiry' });
  }
});

module.exports = router;
