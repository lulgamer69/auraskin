import { useEffect, useState } from 'react';
import { submitCallFeedback } from '../services/api.js';

export default function CallFeedback({ sessionId, visible }) {
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setRating(''); setComment(''); setSaved(false); setSaving(false); setError('');
  }, [sessionId]);

  async function sendFeedback(nextRating = rating) {
    if (!nextRating || saving || saved) return;
    setSaving(true); setError('');
    try {
      await submitCallFeedback({ sessionId, rating: nextRating, comment });
      setRating(nextRating); setSaved(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  if (!visible || !sessionId) return null;

  return (
    <div className="feedback-panel" aria-labelledby="feedback-title">
      <div>
        <p className="eyebrow">QUICK FEEDBACK</p>
        <h3 id="feedback-title">How was Aria’s help?</h3>
        <p className="muted">Your feedback helps us make Aura support better.</p>
      </div>
      {saved ? (
        <p className="feedback-thanks" role="status">Thank you for sharing your feedback.</p>
      ) : (
        <>
          <div className="feedback-options" role="group" aria-label="Rate Aria’s help">
            <button type="button" className={`feedback-choice ${rating === 'up' ? 'selected' : ''}`} onClick={() => { setRating('up'); void sendFeedback('up'); }} disabled={saving} aria-label="Thumbs up, Aria was helpful">👍 <span>Helpful</span></button>
            <button type="button" className={`feedback-choice ${rating === 'down' ? 'selected' : ''}`} onClick={() => { setRating('down'); setError(''); }} disabled={saving} aria-label="Thumbs down, Aria could do better">👎 <span>Could be better</span></button>
          </div>
          {rating === 'down' && (
            <form className="feedback-form" onSubmit={(event) => { event.preventDefault(); void sendFeedback('down'); }}>
              <label htmlFor="feedback-comment">What could we have done better?</label>
              <textarea id="feedback-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} required rows={3} placeholder="Tell us what would have made your experience better…" />
              <button type="submit" className="button button-primary" disabled={saving || !comment.trim()}>{saving ? 'Sending…' : 'Send feedback'}</button>
            </form>
          )}
          {error && <p className="api-error-text" role="alert">{error}</p>}
        </>
      )}
    </div>
  );
}
