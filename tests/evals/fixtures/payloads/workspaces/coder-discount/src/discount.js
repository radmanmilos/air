export function applyDiscount(price, percent) {
  if (!Number.isFinite(price) || !Number.isFinite(percent)) {
    throw new TypeError('price and percent must be finite numbers');
  }
  if (price < 0 || percent < 0 || percent > 100) {
    throw new RangeError('price must be non-negative and percent must be between 0 and 100');
  }

  // Intentional evaluation defect: percent is not converted to a fraction.
  return price - price * percent;
}
