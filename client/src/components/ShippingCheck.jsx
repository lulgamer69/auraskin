import { useState } from 'react';
import { checkShippingPolicy } from '../services/api.js';

export default function ShippingCheck({ isCurrent }) {
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setResult(null);
    const trimmedAmount = amount.trim();
    const numericAmount = Number(trimmedAmount);
    if (!trimmedAmount || !Number.isSafeInteger(numericAmount) || numericAmount < 0) {
      setError('Enter a whole amount in rupees, such as ₹699.');
      return;
    }

    setLoading(true);
    try {
      setResult(await checkShippingPolicy(numericAmount));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="delivery" className={`panel shipping-panel section-anchor${isCurrent ? ' is-current' : ''}`} aria-labelledby="shipping-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">DELIVERY</p>
          <h2 id="shipping-title">Delivery cost</h2>
        </div>
      </div>
      <p className="muted">Enter an order amount to see the delivery charge.</p>
      <form className="shipping-form" onSubmit={handleSubmit}>
        <label htmlFor="order-total">Order total (₹)</label>
        <div className="shipping-input-row">
          <input
            id="order-total"
            type="number"
            min="0"
            step="1"
            value={amount}
            disabled={loading}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="e.g. 699"
            inputMode="numeric"
          />
          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'See cost'}
          </button>
        </div>
      </form>
      {error && <p className="api-error-text" role="alert">{error}</p>}
      {result && (
        <div className={`shipping-result shipping-result-${result.status}`} role="status" aria-live="polite">
          <strong>
            {result.status === 'unspecified'
              ? 'Fee not specified for ₹499'
              : result.shippingFee === 0
                ? 'Free delivery'
                : `₹${result.shippingFee} shipping fee`}
          </strong>
          <span>For an order total of ₹{result.orderTotal}. {result.reason}</span>
          <small>Standard delivery: {result.deliveryWindowBusinessDays.min}–{result.deliveryWindowBusinessDays.max} business days</small>
        </div>
      )}
    </section>
  );
}
