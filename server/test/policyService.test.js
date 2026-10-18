import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCashOnDelivery, checkDamagedProduct, checkReturn, checkShipping } from '../src/services/policyService.js';

test('shipping fee preserves both stated thresholds and leaves exactly ₹499 unspecified', () => {
  assert.equal(checkShipping(498.99).shippingFee, 50);
  assert.equal(checkShipping(498.99).status, 'fee_applies');
  assert.equal(checkShipping(499).status, 'unspecified');
  assert.equal(checkShipping(499).shippingFee, null);
  assert.equal(checkShipping(499.01).shippingFee, 0);
  assert.deepEqual(checkShipping(700).deliveryWindowBusinessDays, { min: 3, max: 5 });
});

test('shipping rejects negative, non-finite, and non-numeric amounts', () => {
  for (const amount of [-1, Number.NaN, Number.POSITIVE_INFINITY, '499', null]) {
    assert.equal(checkShipping(amount).valid, false);
  }
});

test('return allows day 7 only when all product conditions are met', () => {
  assert.equal(checkReturn({ daysSinceDelivery: 7, opened: false, used: false, originalPackaging: true }).eligible, true);
  assert.equal(checkReturn({ daysSinceDelivery: 7.01, opened: false, used: false, originalPackaging: true }).eligible, false);
  assert.equal(checkReturn({ daysSinceDelivery: 1, opened: true, used: false, originalPackaging: true }).eligible, false);
  assert.equal(checkReturn({ daysSinceDelivery: 1, opened: false, used: true, originalPackaging: true }).eligible, false);
  assert.equal(checkReturn({ daysSinceDelivery: 1, opened: false, used: false, originalPackaging: false }).eligible, false);
});

test('return reports every failed condition and rejects malformed input', () => {
  const result = checkReturn({ daysSinceDelivery: 8, opened: true, used: true, originalPackaging: false });
  assert.equal(result.eligible, false);
  assert.equal(result.reasons.length, 4);
  assert.equal(checkReturn({ daysSinceDelivery: -1, opened: false, used: false, originalPackaging: true }).valid, false);
  assert.equal(checkReturn({ daysSinceDelivery: 1, opened: 'false', used: false, originalPackaging: true }).valid, false);
});

test('damaged-product report accepts the 48-hour boundary only when photos are provided', () => {
  assert.equal(checkDamagedProduct({ hoursSinceDelivery: 48, photosProvided: true }).eligible, true);
  assert.equal(checkDamagedProduct({ hoursSinceDelivery: 48.01, photosProvided: true }).eligible, false);
  assert.equal(checkDamagedProduct({ hoursSinceDelivery: 2, photosProvided: false }).eligible, false);
  assert.equal(checkDamagedProduct({ hoursSinceDelivery: -1, photosProvided: true }).valid, false);
});

test('COD allows exactly ₹2,500 with cash or UPI and rejects above-limit or other methods', () => {
  assert.equal(checkCashOnDelivery({ orderTotal: 2500, paymentMethod: 'cash' }).eligible, true);
  assert.equal(checkCashOnDelivery({ orderTotal: 2500, paymentMethod: 'UPI' }).eligible, true);
  assert.equal(checkCashOnDelivery({ orderTotal: 2500.01, paymentMethod: 'cash' }).eligible, false);
  assert.equal(checkCashOnDelivery({ orderTotal: 1000, paymentMethod: 'card' }).eligible, false);
  assert.equal(checkCashOnDelivery({ orderTotal: -1, paymentMethod: 'cash' }).valid, false);
});
