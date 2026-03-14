const mongoose = require('mongoose');

const inventoryLogSchema = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  change_type: { type: String, enum: ['restock', 'sale', 'adjustment', 'return', 'reservation'], required: true },
  quantity_change: { type: Number, required: true },
  previous_quantity: { type: Number, required: true },
  new_quantity: { type: Number, required: true },
  notes: { type: String, default: null },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

module.exports = mongoose.model('InventoryLog', inventoryLogSchema);
