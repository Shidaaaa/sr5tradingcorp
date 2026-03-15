const mongoose = require('mongoose');

const vehicleInquirySchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    inquiry_number: { type: String, unique: true },

    preferred_payment_method: {
      type: String,
      enum: ['installment', 'gcash', 'bank_transfer'],
      default: 'installment',
    },

    // Snapshot of pricing at time of inquiry
    product_price: { type: Number, required: true },
    downpayment_amount: { type: Number },
    financed_amount: { type: Number },
    monthly_amount: { type: Number },
    total_amount: { type: Number },

    installment_plan_name: { type: String },
    installment_months: { type: Number },
    installment_interest_rate: { type: Number },

    notes: { type: String, trim: true },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'converted'],
      default: 'pending',
    },

    admin_notes: { type: String, trim: true },

    // When the inquiry is converted to an actual order
    converted_order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VehicleInquiry', vehicleInquirySchema);
