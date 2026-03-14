const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  rating: { type: Number, min: 1, max: 5, default: null },
  comment: { type: String, default: null },
  type: { type: String, enum: ['product_review', 'service_review', 'suggestion', 'complaint', 'general'], default: 'general' },
  status: { type: String, enum: ['pending', 'reviewed', 'resolved'], default: 'pending' },
  admin_response: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('Feedback', feedbackSchema);
