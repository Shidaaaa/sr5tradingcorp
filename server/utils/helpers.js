const { v4: uuidv4 } = require('uuid');

const VEHICLE_RESERVATION_RATE = 0.05;
const VEHICLE_HOLD_DAYS = 30;

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

function getReservationExpiry(productType) {
  const now = new Date();
  if (productType === 'vehicle') {
    now.setDate(now.getDate() + VEHICLE_HOLD_DAYS);
  } else {
    now.setHours(now.getHours() + 48);
  }
  return now.toISOString();
}

// Returns expiry date for a vehicle reservation.
function getVehicleReservationExpiry() {
  const now = new Date();
  now.setDate(now.getDate() + VEHICLE_HOLD_DAYS);
  return now;
}

function calculateReservationFee(product) {
  if (!product || product.type !== 'vehicle') return 0;
  const fee = Math.round((product.price || 0) * VEHICLE_RESERVATION_RATE);
  return Math.max(0, fee);
}

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function calculateInstallmentBreakdown(remainingBalance, options = {}) {
  const remaining = roundCurrency(remainingBalance);
  const downPaymentRate = Number(options.downPaymentRate ?? 0.5);
  const numberOfInstallments = Number(options.numberOfInstallments ?? 12);
  const interestRate = Number(options.interestRate ?? 0.01);

  const downPaymentAmount = roundCurrency(remaining * downPaymentRate);
  const financedAmount = roundCurrency(Math.max(0, remaining - downPaymentAmount));
  const monthlyAmount = roundCurrency((financedAmount / numberOfInstallments) * (1 + interestRate));
  const totalWithInterest = roundCurrency(monthlyAmount * numberOfInstallments);

  return {
    remainingBalance: remaining,
    downPaymentAmount,
    financedAmount,
    numberOfInstallments,
    interestRate,
    monthlyAmount,
    totalWithInterest,
  };
}

function getMaxReservationDays(productType) {
  if (productType === 'vehicle') return VEHICLE_HOLD_DAYS;
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
  getReservationExpiry,
  getVehicleReservationExpiry,
  calculateReservationFee,
  calculateInstallmentBreakdown,
  VEHICLE_RESERVATION_RATE,
  VEHICLE_HOLD_DAYS,
  getMaxReservationDays,
  addBufferTime,
  formatCurrency
};
