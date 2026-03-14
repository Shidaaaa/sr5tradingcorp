const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String },
  price: { type: Number, required: true },
  category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  type: { type: String, enum: ['vehicle', 'parts', 'tools', 'general'], default: 'general' },
  stock_quantity: { type: Number, default: 0 },
  location: { type: String, default: null },
  condition: { type: String, enum: ['new', 'excellent', 'good', 'fair'], default: 'good' },
  status: { type: String, enum: ['available', 'sold_out', 'reserved'], default: 'available' },
  image_url: { type: String, default: null },
  specifications: { type: String, default: null },
  vehicle_category: { type: String, enum: ['trucks', 'tractors', 'vans', 'other_units', null], default: null },
  reorder_level: { type: Number, default: 5 },
  max_reservation_days: { type: Number, default: null },
  is_popular: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Product', productSchema);
