const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  unit_price: { type: Number, required: true },
  subtotal: { type: Number, required: true },
  reservation_expires_at: { type: Date, default: null },
});

module.exports = mongoose.model('OrderItem', orderItemSchema);
