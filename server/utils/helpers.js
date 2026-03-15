const { v4: uuidv4 } = require('uuid');

function generateOrderNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `SR5-${dateStr}-${random}`;
}

function generateBookingNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `BK-${dateStr}-${random}`;
}

function generateReceiptNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `RCP-${dateStr}-${random}`;
}

function generateInquiryNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INQ-${dateStr}-${random}`;
}

function getReservationExpiry(productType) {
  const now = new Date();
  if (productType === 'vehicle') {
    now.setDate(now.getDate() + 7);
  } else {
    now.setHours(now.getHours() + 48);
  }
  return now.toISOString();
}

// Returns expiry date for a vehicle reservation based on popularity
// Popular vehicles: 14 days (high demand, shorter hold)
// Standard vehicles: 7 days
function getVehicleReservationExpiry(is_popular) {
  const now = new Date();
  now.setDate(now.getDate() + (is_popular ? 14 : 7));
  return now;
}

// Calculates the reservation fee for a vehicle based on popularity
// Popular: 5% of price (min PHP 5,000 / max PHP 50,000)
// Standard: 2% of price (min PHP 2,000 / max PHP 30,000)
function calculateReservationFee(product) {
  if (!product || product.type !== 'vehicle') return 0;
  const rate = product.is_popular ? 0.05 : 0.02;
  const min = product.is_popular ? 5000 : 2000;
  const max = product.is_popular ? 50000 : 30000;
  const fee = Math.round(product.price * rate);
  return Math.max(min, Math.min(max, fee));
}

function getMaxReservationDays(productType) {
  if (productType === 'vehicle') return 7;
  return 90;
}

function addBufferTime(time, bufferMinutes = 120) {
  const [hours, minutes] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + bufferMinutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${newHours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
}

module.exports = {
  generateOrderNumber,
  generateBookingNumber,
  generateReceiptNumber,
  generateInquiryNumber,
  getReservationExpiry,
  getVehicleReservationExpiry,
  calculateReservationFee,
  getMaxReservationDays,
  addBufferTime,
  formatCurrency
};
