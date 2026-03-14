const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
};

async function tryConnect(uri, label) {
  await mongoose.connect(uri, MONGO_OPTIONS);
  console.log(`Connected to MongoDB (${label})`);
}

async function connectDatabase() {
  const primaryUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const localFallbackUri = process.env.MONGODB_LOCAL_URI || 'mongodb://127.0.0.1:27017/sr5tradingcorp';

  try {
    if (primaryUri) {
      await tryConnect(primaryUri, 'primary');
      return;
    }

    await tryConnect(localFallbackUri, 'local-fallback');
    return;
  } catch (err) {
    if (primaryUri && !/localhost|127\.0\.0\.1/.test(primaryUri)) {
      try {
        console.warn('Primary MongoDB connection failed. Trying local fallback...');
        await tryConnect(localFallbackUri, 'local-fallback');
        return;
      } catch (fallbackErr) {
        console.error('MongoDB connection error:', fallbackErr.message);
      }
    } else {
      console.error('MongoDB connection error:', err.message);
    }

    console.error('Set MONGODB_URI for Atlas, or run local MongoDB at mongodb://127.0.0.1:27017/sr5tradingcorp (or set MONGODB_LOCAL_URI).');
    process.exit(1);
  }
}

module.exports = { connectDatabase };
