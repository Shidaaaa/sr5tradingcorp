const express = require('express');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');
const { generateBookingNumber, addBufferTime, calculateReservationFee, getVehicleReservationExpiry } = require('../utils/helpers');

const router = express.Router();

function getBookingLeadLimitDate(productType) {
  const limit = new Date();
  limit.setHours(23, 59, 59, 999);
  limit.setDate(limit.getDate() + (productType === 'vehicle' ? 30 : 90));
  return limit;
}

// Get reservation fee for a vehicle product (MUST be before /:id routes)
router.get('/reservation-fee/:productId', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId).lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (product.type !== 'vehicle') return res.json({ fee: 0, is_popular: false, days: 0, rate: 0 });

    const fee = calculateReservationFee(product);
    const days = product.is_popular ? 14 : 7;
    const rate = product.is_popular ? 5 : 2;
    res.json({ fee, is_popular: product.is_popular, days, rate, product_name: product.name, product_price: product.price });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get user bookings
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Auto-expire overdue vehicle reservations
    await Booking.updateMany(
      { reservation_expires_at: { $lt: new Date() }, status: { $in: ['pending', 'approved'] }, reservation_fee: { $gt: 0 } },
      { status: 'cancelled' }
    );
    // Release products from expired reservations
    const expired = await Booking.find({ status: 'cancelled', reservation_expires_at: { $lt: new Date() } }).lean();
    for (const b of expired) {
      if (b.product_id) await Product.findByIdAndUpdate(b.product_id, { status: 'available' });
    }

    const bookings = await Booking.find({ user_id: req.user.id })
      .populate('product_id', 'name image_url type price is_popular')
      .sort({ created_at: -1 })
      .lean();
    res.json(bookings.map(b => ({
      ...b,
      id: b._id,
      product_name: b.product_id?.name,
      product_image: b.product_id?.image_url,
      product_type: b.product_id?.type,
      product_price: b.product_id?.price,
      product_is_popular: b.product_id?.is_popular,
      product_id: b.product_id?._id,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get single booking
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user_id: req.user.id })
      .populate('product_id', 'name image_url type price is_popular')
      .lean();
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    res.json({
      ...booking,
      id: booking._id,
      product_name: booking.product_id?.name,
      product_image: booking.product_id?.image_url,
      product_type: booking.product_id?.type,
      product_price: booking.product_id?.price,
      product_is_popular: booking.product_id?.is_popular,
      product_id: booking.product_id?._id,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create booking
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { product_id, booking_type, preferred_date, preferred_time, end_time, delivery_method, notes } = req.body;
    if (!product_id || !booking_type || !preferred_date || !preferred_time) {
      return res.status(400).json({ error: 'Product, booking type, date and time are required.' });
    }

    const product = await Product.findById(product_id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (product.status !== 'available') return res.status(400).json({ error: 'Product is not available for booking.' });

    const requestedDate = new Date(`${preferred_date}T00:00:00`);
    if (Number.isNaN(requestedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid preferred date.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (requestedDate < today) {
      return res.status(400).json({ error: 'Preferred date cannot be in the past.' });
    }

    const maxBookingDate = getBookingLeadLimitDate(product.type);
    if (requestedDate > maxBookingDate) {
      return res.status(400).json({
        error: product.type === 'vehicle'
          ? 'Vehicle bookings can only be scheduled up to 1 month in advance.'
          : 'Tools, parts, and other item bookings can only be scheduled up to 3 months in advance.'
      });
    }

    const effectiveEnd = end_time || addBufferTime(preferred_time);

    // Simplified conflict check
    const simpleConflict = await Booking.findOne({
      product_id,
      preferred_date,
      status: { $in: ['pending', 'approved'] },
    });
    if (simpleConflict && booking_type === 'test_drive') {
      const existEnd = simpleConflict.end_time || addBufferTime(simpleConflict.preferred_time);
      if (preferred_time < existEnd && effectiveEnd > simpleConflict.preferred_time) {
        return res.status(409).json({ error: 'Time slot conflicts with an existing booking.' });
      }
    }

    // Calculate reservation fee for vehicles
    const isVehicle = product.type === 'vehicle';
    const reservationFee = isVehicle ? calculateReservationFee(product) : 0;
    const reservationExpiry = isVehicle ? getVehicleReservationExpiry(product.is_popular) : null;

    const booking = await Booking.create({
      user_id: req.user.id,
      product_id,
      booking_number: generateBookingNumber(),
      booking_type,
      preferred_date,
      preferred_time,
      end_time: effectiveEnd,
      status: 'pending',
      reservation_fee: reservationFee,
      reservation_fee_paid: false,
      reservation_expires_at: reservationExpiry,
      delivery_method: delivery_method || 'pickup',
      notes: notes || null,
    });

    // Mark vehicle as reserved immediately
    if (isVehicle) {
      product.status = 'reserved';
      await product.save();
    }

    res.status(201).json({ ...booking.toObject(), id: booking._id, reservation_fee: reservationFee });
  } catch (err) {
    res.status(500).json({ error: 'Server error creating booking.' });
  }
});

// Update booking (cancel)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });

    if (status === 'cancelled') {
      booking.status = 'cancelled';
      await booking.save();
      // Release the vehicle
      if (booking.product_id) {
        await Product.findByIdAndUpdate(booking.product_id, { status: 'available' });
      }
    }

    res.json({ ...booking.toObject(), id: booking._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Update booking status
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    booking.status = status;
    await booking.save();
    if (status === 'cancelled' && booking.product_id) {
      await Product.findByIdAndUpdate(booking.product_id, { status: 'available' });
    }
    res.json({ ...booking.toObject(), id: booking._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Confirm pickup
router.put('/:id/confirm-pickup', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    booking.pickup_confirmed = true;
    await booking.save();
    res.json({ ...booking.toObject(), id: booking._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Mark no-show
router.put('/:id/no-show', authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user_id: req.user.id });
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    booking.status = 'no_show';
    await booking.save();
    res.json({ ...booking.toObject(), id: booking._id });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;