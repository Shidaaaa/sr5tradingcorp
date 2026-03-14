const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  booking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  payment_method: { type: String, enum: ['credit_card', 'debit_card', 'ewallet', 'gcash', 'cash', 'bank_transfer', 'installment'], required: true },
  payment_type: { type: String, enum: ['full', 'partial', 'installment', 'reservation'], default: 'full' },
  reference_number: { type: String, default: null },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
  installment_number: { type: Number, default: null },
  total_installments: { type: Number, default: null },
  installment_plan_name: { type: String, default: null },
  installment_interest_rate: { type: Number, default: 0 },
  remaining_balance: { type: Number, default: 0 },
  notes: { type: String, default: null },
  receipt_number: { type: String, unique: true, sparse: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('Payment', paymentSchema);
