const mongoose = require('mongoose');

const returnRequestSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  order_item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  request_type: { type: String, enum: ['return', 'replacement'], required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  admin_notes: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);
