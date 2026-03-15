const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  booking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  payment_method: { type: String, enum: ['credit_card', 'debit_card', 'ewallet', 'cash', 'bank_transfer', 'installment'], required: true },
  payment_type: { type: String, enum: ['full', 'partial', 'installment', 'reservation', 'down_payment'], default: 'full' },
  reference_number: { type: String, default: null },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
  installment_number: { type: Number, default: null },
  total_installments: { type: Number, default: null },
  remaining_balance: { type: Number, default: 0 },
  receipt_number: { type: String, unique: true, sparse: true },
  receipt_image_url: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('Payment', paymentSchema);
