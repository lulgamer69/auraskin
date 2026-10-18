export default function ProductShowcase({ onNavigate, isCurrent }) {
  return (
    <section id="home" className={`collection-showcase section-anchor${isCurrent ? ' is-current' : ''}`} aria-labelledby="collection-title">
      <div className="collection-copy">
        <p className="eyebrow">AURA CUSTOMER CARE · HERE FOR YOUR ROUTINE</p>
        <h1 id="collection-title">How can we help you today?</h1>
        <p>Order updates, delivery questions, and thoughtful support for the Aura products you love.</p>
        <div className="showcase-actions">
          <a className="showcase-link showcase-link-primary" href="#orders" onClick={(event) => onNavigate(event, 'orders')}>Find an order <span aria-hidden="true">→</span></a>
          <a className="showcase-link showcase-link-secondary" href="#support" onClick={(event) => onNavigate(event, 'support')}>Voice support</a>
        </div>
        <span className="collection-note"><span aria-hidden="true">✳</span> A little care goes a long way</span>
      </div>
      <figure className="collection-photo">
        <img
          src="/products/aura-product-lineup.png"
          alt="Aura Vitamin C serum, sunscreen, and Green Tea skincare products arranged together"
        />
        <figcaption>Thoughtful skincare, made simple</figcaption>
      </figure>
    </section>
  );
}
