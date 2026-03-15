/* eslint-disable no-console */
const assert = require('assert');
const { calculateReservationFee, calculateInstallmentBreakdown } = require('../utils/helpers');

function nearlyEqual(a, b, epsilon = 0.01) {
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

function testReservationFeeFixedRate() {
  const vehicle = { type: 'vehicle', price: 500000, is_popular: false };
  const popularVehicle = { type: 'vehicle', price: 500000, is_popular: true };
  const nonVehicle = { type: 'parts', price: 500000 };

  assert.strictEqual(calculateReservationFee(vehicle), 25000, 'Vehicle reservation fee should be 5%');
  assert.strictEqual(calculateReservationFee(popularVehicle), 25000, 'Popular flag must not change vehicle reservation fee');
  assert.strictEqual(calculateReservationFee(nonVehicle), 0, 'Non-vehicle reservation fee should be zero');
}

function testInstallmentBreakdownScenario() {
  const remaining = 475000;
  const result = calculateInstallmentBreakdown(remaining, {
    downPaymentRate: 0.5,
    numberOfInstallments: 12,
    interestRate: 0.01,
  });

  assert.strictEqual(result.remainingBalance, 475000, 'Remaining balance mismatch');
  assert.strictEqual(result.downPaymentAmount, 237500, 'Down payment should be 50%');
  assert.strictEqual(result.financedAmount, 237500, 'Financed amount mismatch');
  assert.strictEqual(result.numberOfInstallments, 12, 'Installment count mismatch');
  assert.strictEqual(result.interestRate, 0.01, 'Interest rate mismatch');

  const expectedMonthly = 19989.58;
  const expectedTotalWithInterest = 239874.96;
  assert(
    nearlyEqual(result.monthlyAmount, expectedMonthly),
    `Monthly amount mismatch. Expected ~${expectedMonthly}, got ${result.monthlyAmount}`
  );
  assert(
    nearlyEqual(result.totalWithInterest, expectedTotalWithInterest),
    `Total with interest mismatch. Expected ~${expectedTotalWithInterest}, got ${result.totalWithInterest}`
  );
}

function run() {
  console.log('Running installment phase 4 checks...');
  testReservationFeeFixedRate();
  testInstallmentBreakdownScenario();
  console.log('All installment phase 4 checks passed.');
}

run();
