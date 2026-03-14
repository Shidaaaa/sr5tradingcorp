const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  email_verified: { type: Boolean, default: true },
  verification_code_hash: { type: String, default: null },
  verification_code_expires_at: { type: Date, default: null },
  verification_code_sent_at: { type: Date, default: null },
  first_name: { type: String, required: true, trim: true },
  last_name: { type: String, required: true, trim: true },
  phone: { type: String, default: null },
  address: { type: String, default: null },
  city: { type: String, default: null },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('User', userSchema);
