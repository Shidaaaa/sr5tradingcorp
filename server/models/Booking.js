const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  booking_number: { type: String, unique: true, required: true },
  booking_type: { type: String, enum: ['test_drive', 'vehicle_viewing', 'service_appointment'], required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  preferred_date: { type: String, required: true },
  preferred_time: { type: String, required: true },
  end_time: { type: String, default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed', 'no_show', 'cancelled'], default: 'pending' },
  reservation_expires_at: { type: Date, default: null },
  reservation_fee: { type: Number, default: 0 },
  reservation_fee_paid: { type: Boolean, default: false },
  pickup_confirmed: { type: Boolean, default: false },
  delivery_method: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
  notes: { type: String, default: null },
  admin_notes: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Booking', bookingSchema);
