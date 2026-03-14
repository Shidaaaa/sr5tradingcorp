const express = require('express');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const { authenticateToken } = require('../middleware/auth');
const { generateBookingNumber, addBufferTime } = require('../utils/helpers');

const router = express.Router();

const HOLIDAY_MM_DD = new Set([
  '01-01',
  '04-09',
  '05-01',
  '06-12',
  '08-21',
  '11-01',
  '11-30',
  '12-08',
  '12-25',
  '12-30',
  '12-31',
]);

function isHolidayDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return HOLIDAY_MM_DD.has(`${month}-${day}`);
}

function getRollingMaxBookingDate() {
  const now = new Date();
  // Last day of next month; e.g. March -> April 30, December -> January 31 (next year)
  return new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
}

function buildTimeSlots(start = '08:00', end = '17:00', intervalMinutes = 60) {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startTotal = (startH * 60) + startM;
  const endTotal = (endH * 60) + endM;

  const slots = [];
  for (let t = startTotal; t <= endTotal; t += intervalMinutes) {
    const h = String(Math.floor(t / 60)).padStart(2, '0');
    const m = String(t % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots;
}

const BOOKING_TIME_SLOTS = buildTimeSlots('08:00', '17:00', 15);

// Get reservation fee for a vehicle product (MUST be before /:id routes)
router.get('/reservation-fee/:productId', authenticateToken, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId).lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // Reservation fees are disabled; booking time slot itself secures the appointment.
    res.json({
      fee: 0,
      is_popular: !!product.is_popular,
      days: 0,
      rate: 0,
      product_name: product.name,
      product_price: product.price,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get unavailable / available time slots for a product and date
router.get('/availability/:productId', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date query parameter is required.' });

    const bookings = await Booking.find({
      preferred_date: date,
      status: { $in: ['pending', 'approved'] },
    }).select('preferred_time').lean();

    const unavailable_times = Array.from(new Set(bookings.map(b => b.preferred_time))).sort();
    const available_times = BOOKING_TIME_SLOTS.filter(time => !unavailable_times.includes(time));

    res.json({
      date,
      product_id: req.params.productId,
      unavailable_times,
      available_times,
      all_slots: BOOKING_TIME_SLOTS,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Get user bookings
router.get('/', authenticateToken, async (req, res) => {
  try {
    await Booking.updateMany(
      {
        reservation_expires_at: { $lt: new Date() },
        status: { $in: ['pending', 'approved'] },
        reservation_fee: { $gt: 0 },
      },
      { status: 'cancelled' }
    );

    const expired = await Booking.find({
      status: 'cancelled',
      reservation_expires_at: { $lt: new Date() },
    }).lean();

    for (const booking of expired) {
      if (booking.product_id) await Product.findByIdAndUpdate(booking.product_id, { status: 'available' });
    }

    const bookings = await Booking.find({ user_id: req.user.id })
      .populate('product_id', 'name image_url type price is_popular')
      .sort({ created_at: -1 })
      .lean();

    res.json(bookings.map(booking => ({
      ...booking,
      id: booking._id,
      product_name: booking.product_id?.name,
      product_image: booking.product_id?.image_url,
      product_type: booking.product_id?.type,
      product_price: booking.product_id?.price,
      product_is_popular: booking.product_id?.is_popular,
      product_id: booking.product_id?._id,
      reservation_fee: 0,
      reservation_fee_paid: true,
      reservation_expires_at: null,
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
      reservation_fee: 0,
      reservation_fee_paid: true,
      reservation_expires_at: null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Create booking
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { product_id, service_type, booking_type, preferred_date, preferred_time, end_time, notes } = req.body;
    if (!booking_type || !preferred_date || !preferred_time) {
      return res.status(400).json({ error: 'Booking type, date and time are required.' });
    }

    const requiresVehicle = booking_type === 'test_drive' || booking_type === 'vehicle_viewing';
    const isServiceAppointment = booking_type === 'service_appointment';

    let product = null;
    if (requiresVehicle) {
      if (!product_id) return res.status(400).json({ error: 'Please select a vehicle for this booking type.' });

      product = await Product.findById(product_id);
      if (!product) return res.status(404).json({ error: 'Product not found.' });
      if (product.type !== 'vehicle') return res.status(400).json({ error: 'Only vehicles can be booked for test drives or vehicle viewing.' });
      if (product.status !== 'available') return res.status(400).json({ error: 'Product is not available for booking.' });
    }

    if (isServiceAppointment && !service_type) {
      return res.status(400).json({ error: 'Please select a service type for service appointments.' });
    }

    const requestedDate = new Date(`${preferred_date}T00:00:00`);
    if (Number.isNaN(requestedDate.getTime())) {
      return res.status(400).json({ error: 'Invalid preferred date.' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (requestedDate < today) {
      return res.status(400).json({ error: 'Preferred date cannot be in the past.' });
    }

    const maxBookingDate = getRollingMaxBookingDate();
    if (requestedDate > maxBookingDate) {
      return res.status(400).json({
        error: 'Bookings can only be scheduled from the current month up to the next month.',
      });
    }

    if (requestedDate.getDay() === 0) {
      return res.status(400).json({ error: 'Bookings are not available on Sundays.' });
    }

    if (isHolidayDate(requestedDate)) {
      return res.status(400).json({ error: 'Bookings are not available on holidays.' });
    }

    if (!BOOKING_TIME_SLOTS.includes(preferred_time)) {
      return res.status(400).json({ error: 'Selected time is not an available booking slot.' });
    }

    const alreadyBooked = await Booking.findOne({
      preferred_date,
      preferred_time,
      status: { $in: ['pending', 'approved'] },
    }).lean();

    if (alreadyBooked) {
      return res.status(409).json({ error: 'This time slot is already booked. Please choose another time.' });
    }

    const effectiveEnd = end_time || addBufferTime(preferred_time);
    const reservationFee = 0;
    const reservationExpiry = null;

    const booking = await Booking.create({
      user_id: req.user.id,
      product_id: product ? product._id : null,
      service_type: isServiceAppointment ? service_type : null,
      booking_number: generateBookingNumber(),
      booking_type,
      preferred_date,
      preferred_time,
      end_time: effectiveEnd,
      status: 'pending',
      reservation_fee: reservationFee,
      reservation_fee_paid: false,
      reservation_expires_at: reservationExpiry,
      notes: notes || null,
    });

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
