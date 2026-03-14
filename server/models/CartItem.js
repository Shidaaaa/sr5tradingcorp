const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, default: 1 },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

cartItemSchema.index({ user_id: 1, product_id: 1 }, { unique: true });

module.exports = mongoose.model('CartItem', cartItemSchema);
