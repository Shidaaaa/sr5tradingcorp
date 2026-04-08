const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { connectDatabase } = require('./config/database');
const { startInstallmentReminderJob } = require('./services/installmentReminderJob');

const app = express();

const defaultCorsOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];
const envCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins = envCorsOrigins.length ? envCorsOrigins : defaultCorsOrigins;

function corsOriginValidator(origin, callback) {
  // Allow same-origin/server-to-server requests that do not send an Origin header.
  if (!origin) return callback(null, true);
  if (allowedCorsOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin not allowed by CORS policy.'));
}

// Middleware
app.disable('x-powered-by');
app.use(cors({
  origin: corsOriginValidator,
  credentials: true,
}));
app.use('/api/payments/paymongo/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/admin', require('./routes/admin'));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;

connectDatabase().then(() => {
  startInstallmentReminderJob();
  app.listen(PORT, () => {
    console.log(`SR-5 Trading Corporation API running on port ${PORT}`);
  });
});
