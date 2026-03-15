const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order_number: { type: String, unique: true, required: true },
  total_amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'ready', 'picked_up', 'delivered', 'completed', 'cancelled', 'return_requested', 'returned', 'replaced', 'installment_active', 'installment_defaulted'], default: 'pending' },
  payment_method: { type: String, enum: ['full', 'installment', null], default: null },
  has_vehicle: { type: Boolean, default: false },
  reservation_fee_total: { type: Number, default: 0 },
  reservation_fee_paid: { type: Boolean, default: false },
  reservation_expires_at: { type: Date, default: null },
  delivery_method: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
  delivery_address: { type: String, default: null },
  notes: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Order', orderSchema);
