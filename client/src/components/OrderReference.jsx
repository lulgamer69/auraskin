import { useEffect, useState } from 'react';
import { getSampleOrders } from '../services/api.js';
import sampleOrderIds from '../data/sampleOrders.js';

export default function OrderReference({ isCurrent }) {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    setStatus('loading');
    setError('');
    getSampleOrders(sampleOrderIds)
      .then((results) => {
        if (!isCurrent) return;
        setOrders(results);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (!isCurrent) return;
        setError(requestError.message);
        setStatus('error');
      });
    return () => { isCurrent = false; };
  }, [reloadKey]);

  return (
    <section id="orders" className={`panel orders-panel section-anchor${isCurrent ? ' is-current' : ''}`} aria-labelledby="orders-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ORDER HELP</p>
          <h2 id="orders-title">Orders to explore</h2>
        </div>
        <span className="quiet-badge">{sampleOrderIds.length} examples</span>
      </div>
      <p className="muted order-intro">Try Aura support with these example orders.</p>
      {status === 'loading' && <p className="api-message" role="status">Getting your orders…</p>}
      {status === 'error' && (
        <div className="api-error" role="alert">
          <p>{error}</p>
          <button className="text-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button>
        </div>
      )}
      {status === 'ready' && <div className="order-list">
        {orders.map((order) => (
          <article className="order-card" key={order.id}>
            <div
              className={`order-product-photo ${order.id === 'ORD-101' ? 'photo-serum' : order.id === 'ORD-102' ? 'photo-sunscreen' : 'photo-green-tea'}`}
              role="img"
              aria-label={`${order.product} skincare product photo`}
            />
            <div className="order-content">
              <div className="order-topline">
                <span className="order-id">{order.id}</span>
                <span className={`order-status ${order.status === 'Delivered' ? 'delivered' : order.status === 'Processing' ? 'processing' : 'out-for-delivery'}`}>
                  {order.status}
                </span>
              </div>
              <h3>{order.product}</h3>
              <div className="order-meta"><span>{order.customer}</span><strong>₹{order.amount}</strong></div>
              {order.tracking && <p className="order-note">{order.tracking.carrier} · {order.tracking.trackingId}</p>}
              <p className="order-note">{order.note}</p>
            </div>
          </article>
        ))}
      </div>}
    </section>
  );
}
