const businessDays = { min: 3, max: 5 };

function validNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function checkShipping(orderTotal) {
  if (!validNonNegativeNumber(orderTotal)) {
    return { valid: false, reason: 'orderTotal must be a finite, non-negative number.' };
  }
  if (orderTotal === 499) {
    return {
      valid: true,
      status: 'unspecified',
      eligible: null,
      orderTotal,
      shippingFee: null,
      deliveryWindowBusinessDays: businessDays,
      reason: 'The policy does not specify the shipping fee for an order totaling exactly ₹499.',
    };
  }
  const free = orderTotal > 499;
  const shippingFee = free ? 0 : 50;
  return {
    valid: true,
    status: free ? 'eligible' : 'fee_applies',
    eligible: free,
    orderTotal,
    shippingFee,
    deliveryWindowBusinessDays: businessDays,
    reason: free
      ? 'Free delivery applies to orders above ₹499.'
      : 'Orders below ₹499 have a ₹50 shipping fee.',
  };
}

export function checkReturn({ daysSinceDelivery, opened, used, originalPackaging } = {}) {
  if (!validNonNegativeNumber(daysSinceDelivery)
      || typeof opened !== 'boolean'
      || typeof used !== 'boolean'
      || typeof originalPackaging !== 'boolean') {
    return {
      valid: false,
      reason: 'Provide daysSinceDelivery as a non-negative number and opened, used, and originalPackaging as booleans.',
    };
  }

  const reasons = [];
  if (daysSinceDelivery > 7) reasons.push('Returns are accepted only within 7 days of delivery.');
  if (opened) reasons.push('The product must be unopened.');
  if (used) reasons.push('The product must be unused.');
  if (!originalPackaging) reasons.push('The product must be in its original packaging.');
  const eligible = reasons.length === 0;
  return {
    valid: true,
    status: eligible ? 'eligible' : 'ineligible',
    eligible,
    reasons: eligible ? ['The stated return requirements are met.'] : reasons,
    note: 'Eligibility is not confirmation that a return or refund has been processed.',
  };
}

export function checkDamagedProduct({ hoursSinceDelivery, photosProvided } = {}) {
  if (!validNonNegativeNumber(hoursSinceDelivery) || typeof photosProvided !== 'boolean') {
    return {
      valid: false,
      reason: 'Provide hoursSinceDelivery as a non-negative number and photosProvided as a boolean.',
    };
  }
  const reasons = [];
  if (hoursSinceDelivery > 48) reasons.push('Damaged or defective products must be reported within 48 hours of delivery.');
  if (!photosProvided) reasons.push('Photos are required to request a replacement.');
  const eligible = reasons.length === 0;
  return {
    valid: true,
    status: eligible ? 'eligible' : 'ineligible',
    eligible,
    reasons: eligible ? ['The stated reporting requirements are met.'] : reasons,
    note: 'Eligibility is not confirmation that a replacement has been issued.',
  };
}

export function checkCashOnDelivery({ orderTotal, paymentMethod } = {}) {
  if (!validNonNegativeNumber(orderTotal) || typeof paymentMethod !== 'string') {
    return {
      valid: false,
      reason: 'Provide orderTotal as a non-negative number and paymentMethod as cash or UPI.',
    };
  }
  const method = paymentMethod.trim().toLowerCase();
  const reasons = [];
  if (orderTotal > 2500) reasons.push('Cash on Delivery is available only for orders up to ₹2,500.');
  if (!['cash', 'upi'].includes(method)) reasons.push('Cash on Delivery payment must be made by cash or UPI at the doorstep.');
  const eligible = reasons.length === 0;
  return {
    valid: true,
    status: eligible ? 'eligible' : 'ineligible',
    eligible,
    orderTotal,
    paymentMethod: method,
    reasons: eligible ? ['The order amount and payment method meet the stated COD policy.'] : reasons,
  };
}
