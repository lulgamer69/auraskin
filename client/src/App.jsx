import { useCallback, useEffect, useRef, useState } from 'react';
import CallControls from './components/CallControls.jsx';
import ChatComposer from './components/ChatComposer.jsx';
import CallStatus from './components/CallStatus.jsx';
import CallSummary from './components/CallSummary.jsx';
import OrderReference from './components/OrderReference.jsx';
import ProductShowcase from './components/ProductShowcase.jsx';
import ShippingCheck from './components/ShippingCheck.jsx';
import Transcript from './components/Transcript.jsx';
import useCallSession from './hooks/useCallSession.js';

export default function App() {
  const { mode, chooseMode, status, callActive, ending, transcript, pendingTranscript, updateReviewedTranscript, submitReviewedTranscript, discardReviewedTranscript, summary, summaryLoading, error, sessionId, startCall, startChat, submitMessage, endCall, retrySummary } = useCallSession();
  const [activeSection, setActiveSection] = useState('home');
  const pendingNavigation = useRef(null);
  const scrollFallback = useRef(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('aura-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  const finishPendingNavigation = useCallback(() => {
    if (!pendingNavigation.current) return;
    setActiveSection(pendingNavigation.current);
    pendingNavigation.current = null;
    window.clearTimeout(scrollFallback.current);
  }, []);

  useEffect(() => {
    try { localStorage.setItem('aura-theme', theme); } catch { /* Theme still works for this visit. */ }
  }, [theme]);

  useEffect(() => {
    const targets = ['home', 'support', 'delivery', 'orders']
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const observer = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
        if (pendingNavigation.current) return;
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      }, { rootMargin: '-18% 0px -62% 0px', threshold: 0 })
      : null;
    targets.forEach((target) => observer?.observe(target));
    document.addEventListener('scrollend', finishPendingNavigation);
    return () => {
      observer?.disconnect();
      document.removeEventListener('scrollend', finishPendingNavigation);
      window.clearTimeout(scrollFallback.current);
    };
  }, [finishPendingNavigation]);

  function navigateToSection(event, sectionId) {
    const target = document.getElementById(sectionId);
    if (!target) return;
    event.preventDefault();
    pendingNavigation.current = sectionId;
    if (activeSection === sectionId) setActiveSection('');
    window.history.replaceState(null, '', `#${sectionId}`);
    const targetStyle = window.getComputedStyle(target);
    const scrollMargin = Number.parseFloat(targetStyle.scrollMarginTop) || 96;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const destination = Math.max(0, Math.min(maxScroll, window.scrollY + target.getBoundingClientRect().top - scrollMargin));
    if (Math.abs(destination - window.scrollY) < 2) {
      window.clearTimeout(scrollFallback.current);
      window.requestAnimationFrame(finishPendingNavigation);
      return;
    }
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    window.clearTimeout(scrollFallback.current);
    scrollFallback.current = window.setTimeout(finishPendingNavigation, 2200);
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      <header className="topbar">
        <a className="brand" href="#home" onClick={(event) => navigateToSection(event, 'home')} aria-label="Aura Skincare home">
          <span className="brand-mark" aria-hidden="true">a</span>
          <span><strong>aura</strong><small>SKINCARE</small></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className={activeSection === 'support' ? 'active' : ''} aria-current={activeSection === 'support' ? 'location' : undefined} href="#support" onClick={(event) => navigateToSection(event, 'support')}>Support</a>
          <a className={activeSection === 'delivery' ? 'active' : ''} aria-current={activeSection === 'delivery' ? 'location' : undefined} href="#delivery" onClick={(event) => navigateToSection(event, 'delivery')}>Delivery</a>
          <a className={activeSection === 'orders' ? 'active' : ''} aria-current={activeSection === 'orders' ? 'location' : undefined} href="#orders" onClick={(event) => navigateToSection(event, 'orders')}>Orders</a>
        </nav>
        <div className="topbar-right">
          <span className="prototype-tag"><span aria-hidden="true" /> Aura care</span>
          <button className="theme-toggle" type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            <span aria-hidden="true">{theme === 'light' ? '☾' : '☼'}</span>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
        </div>
      </header>

      <main id="main" className="dashboard">
        <ProductShowcase onNavigate={navigateToSection} isCurrent={activeSection === 'home'} />

        <div className="dashboard-grid">
          <div className="primary-column">
            <CallControls isCurrent={activeSection === 'support'} mode={mode} onModeChange={chooseMode} active={callActive} ending={ending} status={status} error={error} onStart={mode === 'voice' ? startCall : startChat} onEnd={endCall} />
            <Transcript active={callActive} mode={mode} status={status} messages={transcript} pendingTranscript={pendingTranscript} onDraftChange={updateReviewedTranscript} onDraftSend={submitReviewedTranscript} onDraftRetry={discardReviewedTranscript} />
            <ChatComposer active={callActive && mode === 'chat'} busy={status === 'Thinking' || ending} onSend={submitMessage} />
            <CallSummary summary={summary} loading={summaryLoading} hasConversation={transcript.length > 0} onRetry={retrySummary} sessionId={sessionId} callEnded={!callActive && !ending && transcript.length > 0} />
          </div>
          <aside className="side-column" aria-label="Support and order help">
            <CallStatus mode={mode} status={status} callActive={callActive} />
            <ShippingCheck isCurrent={activeSection === 'delivery'} />
          </aside>
        </div>
        <OrderReference isCurrent={activeSection === 'orders'} />
        <footer className="page-footer">
          <span>Thoughtful support, made simple.</span>
          <span>Made with care by Aura Skincare</span>
        </footer>
      </main>
    </div>
  );
}
