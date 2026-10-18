import { useEffect, useRef } from 'react';

export default function Transcript({ active, mode = 'voice', status, messages, pendingTranscript = '', onDraftChange, onDraftSend, onDraftRetry }) {
  const messagesRef = useRef(null);
  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({ top: container.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [messages, pendingTranscript]);

  return (
    <section className="panel transcript-panel" aria-labelledby="transcript-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">CONVERSATION</p>
          <h2 id="transcript-title">{mode === 'chat' ? 'Messages' : 'Call transcript'}</h2>
        </div>
        <span className="quiet-badge">{active ? status : messages.length ? 'Call ended' : 'No call yet'}</span>
      </div>
      {messages.length > 0 || pendingTranscript ? (
        <div className="transcript-messages" ref={messagesRef} aria-live="polite" aria-relevant="additions">
          {messages.map((message, index) => (
            <article className={`transcript-message message-${message.role}`} key={`${message.timestamp}-${index}`}>
              <span>{message.role === 'customer' ? 'You' : 'Aria'}</span>
              <p>{message.text}</p>
            </article>
          ))}
          {pendingTranscript && <section className="transcript-draft" aria-label="Review voice transcript">
            <label htmlFor="voice-transcript-draft">I may have misheard you</label>
            <textarea id="voice-transcript-draft" value={pendingTranscript} onChange={(event) => onDraftChange?.(event.target.value)} rows={3} maxLength={1200} />
            <p>This sounded unclear. Correct any words that look wrong, or send it as-is.</p>
            <div className="transcript-draft-actions">
              <button className="button button-quiet" type="button" onClick={onDraftRetry}>Try again</button>
              <button className="button button-primary" type="button" onClick={onDraftSend} disabled={!pendingTranscript.trim()}>Send to Aria</button>
            </div>
          </section>}
          {active && (mode === 'voice' || status === 'Thinking') && <div className="transcript-current-state"><span className="status-dot" /> {status === 'Listening' ? 'Listening for your next question…' : status === 'Reviewing' ? 'Your transcript is ready to check.' : status === 'Thinking' ? mode === 'chat' ? 'Aria is writing…' : 'Checking that for you…' : 'Aria is speaking…'}</div>}
        </div>
      ) : active && mode === 'voice' ? (
        <div className="voice-preview-stage" aria-live="polite">
          <div className="microphone-visual" aria-hidden="true">
            <span className="mic-ring mic-ring-one" />
            <span className="mic-ring mic-ring-two" />
            <span className="mic-orb">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" />
              </svg>
            </span>
          </div>
          <strong className="voice-preview-title">{status === 'Listening' ? 'I’m listening' : status === 'Thinking' ? 'One moment' : 'Aria is speaking'}</strong>
          <span className="preview-disclaimer">Microphone is on · Your words will appear here</span>
        </div>
      ) : active ? (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">✉</span>
          <p>Start the conversation</p>
          <span>Type your Aura Skincare question below.</span>
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">“</span>
          <p>Your conversation will appear here.</p>
          <span>{mode === 'chat' ? 'Start a chat and your messages will appear here.' : 'Start a voice call to see the transcript as you speak.'}</span>
        </div>
      )}
    </section>
  );
}
