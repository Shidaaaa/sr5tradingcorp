const mongoose = require('mongoose');

const installmentScheduleSchema = new mongoose.Schema({
  installment_plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true, index: true },
  installment_number: { type: Number, required: true },
  amount_due: { type: Number, required: true },
  amount_paid: { type: Number, default: 0 },
  due_date: { type: Date, required: true, index: true },
  paid_date: { type: Date, default: null },
  reminder_7d_sent_at: { type: Date, default: null },
  reminder_3d_sent_at: { type: Date, default: null },
  status: {
    type: String,
    enum: ['pending', 'paid', 'overdue', 'partially_paid'],
    default: 'pending',
    index: true,
  },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

installmentScheduleSchema.index({ installment_plan_id: 1, installment_number: 1 }, { unique: true });

module.exports = mongoose.model('InstallmentSchedule', installmentScheduleSchema);
