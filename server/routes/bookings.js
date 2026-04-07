const express = require('express');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');
const { generateBookingNumber, addBufferTime, calculateReservationFee, getVehicleReservationExpiry, VEHICLE_HOLD_DAYS } = require('../utils/helpers');

const router = express.Router();
const DAILY_BOOKING_CAPACITY = Number(process.env.BOOKING_DAILY_CAPACITY) > 0
  ? Number(process.env.BOOKING_DAILY_CAPACITY)
  : 5;
const STORE_OPEN_TIME = process.env.BOOKING_STORE_OPEN_TIME || '08:00';
const STORE_CLOSE_TIME = process.env.BOOKING_STORE_CLOSE_TIME || '15:00';
const LUNCH_START_TIME = process.env.BOOKING_LUNCH_START || '12:00';
const LUNCH_END_TIME = process.env.BOOKING_LUNCH_END || '13:00';
const HOLIDAY_DATES = String(process.env.BOOKING_HOLIDAYS || '')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

function isValidTimeString(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || ''));
}

function toMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return (hours * 60) + minutes;
}

function isHolidayDate(dateStr) {
  return HOLIDAY_DATES.includes(String(dateStr || '').slice(0, 10));
}

function buildMonthHolidayList(year, month) {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
  return HOLIDAY_DATES.filter((date) => date.startsWith(monthPrefix)).sort();
}

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
    const days = VEHICLE_HOLD_DAYS;
    const rate = 5;
    res.json({ fee, is_popular: product.is_popular, days, rate, product_name: product.name, product_price: product.price });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get month availability (counts only, no customer data)
router.get('/availability', authenticateToken, async (req, res) => {
  try {
    const monthParam = String(req.query.month || '').trim();
    const match = monthParam.match(/^(\d{4})-(\d{2})$/);

    let year;
    let month;
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month parameter.' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const activeBookings = await Booking.find({
      status: { $in: ['pending', 'approved'] },
      preferred_date: { $gte: startDate.toISOString().slice(0, 10), $lt: endDate.toISOString().slice(0, 10) },
    }).select('preferred_date').lean();

    const counts = {};
    activeBookings.forEach((booking) => {
      const key = String(booking.preferred_date || '').slice(0, 10);
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
    });

    const fullyBookedDates = Object.entries(counts)
      .filter(([, count]) => Number(count || 0) >= DAILY_BOOKING_CAPACITY)
      .map(([date]) => date)
      .sort();
    const holidays = buildMonthHolidayList(year, month);

    res.json({
      month: `${year}-${String(month).padStart(2, '0')}`,
      daily_capacity: DAILY_BOOKING_CAPACITY,
      store_open_time: STORE_OPEN_TIME,
      store_close_time: STORE_CLOSE_TIME,
      lunch_start_time: LUNCH_START_TIME,
      lunch_end_time: LUNCH_END_TIME,
      holidays,
      counts,
      fully_booked_dates: fullyBookedDates,
    });
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
      user_id: b.user_id,
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
      user_id: booking.user_id,
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

    if (isHolidayDate(preferred_date)) {
      return res.status(400).json({ error: 'Bookings are not available on holidays. Please choose another date.' });
    }

    if (!isValidTimeString(preferred_time)) {
      return res.status(400).json({ error: 'Invalid preferred time format.' });
    }

    const effectiveEnd = end_time || addBufferTime(preferred_time);

    if (!isValidTimeString(effectiveEnd)) {
      return res.status(400).json({ error: 'Invalid end time format.' });
    }

    const startMin = toMinutes(preferred_time);
    const endMin = toMinutes(effectiveEnd);
    const openMin = toMinutes(STORE_OPEN_TIME);
    const closeMin = toMinutes(STORE_CLOSE_TIME);
    const lunchStartMin = toMinutes(LUNCH_START_TIME);
    const lunchEndMin = toMinutes(LUNCH_END_TIME);

    if (startMin < openMin || startMin >= closeMin) {
      return res.status(400).json({ error: `Bookings are only allowed between ${STORE_OPEN_TIME} and ${STORE_CLOSE_TIME}.` });
    }

    if (endMin > closeMin) {
      return res.status(400).json({ error: `Selected time exceeds store hours. Please choose a slot that ends by ${STORE_CLOSE_TIME}.` });
    }

    const overlapsLunch = startMin < lunchEndMin && endMin > lunchStartMin;
    if (overlapsLunch) {
      return res.status(400).json({ error: `Selected time overlaps lunch break (${LUNCH_START_TIME}-${LUNCH_END_TIME}).` });
    }

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
    const reservationExpiry = isVehicle ? getVehicleReservationExpiry() : null;

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