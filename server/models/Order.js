const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order_number: { type: String, unique: true, required: true },
  total_amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'ready', 'picked_up', 'delivered', 'completed', 'cancelled', 'return_requested', 'returned', 'replaced'], default: 'pending' },
  has_vehicle: { type: Boolean, default: false },
  reservation_fee_total: { type: Number, default: 0 },
  reservation_fee_paid: { type: Boolean, default: false },
  reservation_expires_at: { type: Date, default: null },
  vehicle_payment_method: { type: String, enum: ['gcash', 'bank_transfer', 'installment', null], default: null },
  installment_plan_name: { type: String, default: null },
  installment_downpayment_rate: { type: Number, default: 0 },
  installment_interest_rate: { type: Number, default: 0 },
  installment_months: { type: Number, default: 0 },
  pickup_payment_required_total: { type: Number, default: 0 },
  financed_amount: { type: Number, default: 0 },
  monthly_installment_amount: { type: Number, default: 0 },
  installment_schedule: [{
    installment_number: { type: Number, required: true },
    due_date: { type: Date, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid', 'overdue'], default: 'pending' },
    paid_at: { type: Date, default: null },
    payment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
  }],
  delivery_method: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
  delivery_address: { type: String, default: null },
  notes: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Order', orderSchema);
