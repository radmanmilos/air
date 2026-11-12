import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount } from '../src/discount.js';

test('applies percentage to the original price', () => {
  assert.equal(applyDiscount(100, 20), 80);
});

test('zero percent leaves the price unchanged', () => {
  assert.equal(applyDiscount(100, 0), 100);
});

test('zero price remains zero', () => {
  assert.equal(applyDiscount(0, 20), 0);
});

test('rejects negative prices', () => {
  assert.throws(() => applyDiscount(-1, 10), RangeError);
});

test('rejects percentages above one hundred', () => {
  assert.throws(() => applyDiscount(100, 101), RangeError);
});
