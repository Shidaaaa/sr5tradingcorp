const mongoose = require('mongoose');

const installmentPlanSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  total_financed_amount: { type: Number, required: true },
  down_payment_amount: { type: Number, required: true },
  down_payment_paid: { type: Boolean, default: false },
  number_of_installments: { type: Number, default: 12 },
  monthly_amount: { type: Number, required: true },
  interest_rate: { type: Number, default: 0.01 },
  total_with_interest: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'defaulted', 'cancelled'],
    default: 'pending',
    index: true,
  },
  start_date: { type: Date, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('InstallmentPlan', installmentPlanSchema);
