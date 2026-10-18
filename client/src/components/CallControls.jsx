export default function CallControls({ active, ending, status, error, onStart, onEnd, isCurrent, mode, onModeChange }) {
  return (
    <section id="support" className={`controls-panel section-anchor${isCurrent ? ' is-current' : ''}`} aria-labelledby="controls-title">
      <div className="controls-copy">
        <p className="eyebrow">PERSONAL SUPPORT</p>
        <h2 id="controls-title">Talk to our care team</h2>
        <p>{ending
          ? 'Saving your conversation and preparing a short recap…'
          : active
            ? mode === 'voice' ? 'Speak naturally. Check the transcript before sending it to Aria, who will reply aloud.' : 'Send a message about an Aura order or policy. Aria will reply here.'
            : 'Choose voice or chat to ask about an Aura order or policy.'}</p>
        {error && <p className="call-error" role="alert">{error}</p>}
      </div>
      <div className="control-actions">
        <div className="support-mode-switch" role="group" aria-label="Choose support type">
          <button type="button" aria-pressed={mode === 'voice'} onClick={() => onModeChange('voice')} disabled={ending}>🎙 Voice</button>
          <button type="button" aria-pressed={mode === 'chat'} onClick={() => onModeChange('chat')} disabled={ending}>▰ Chat</button>
        </div>
        {active
          ? <button className="button button-secondary" type="button" onClick={onEnd} disabled={ending}>
            <span aria-hidden="true">■</span> {mode === 'chat' ? 'End chat' : 'End call'}
          </button>
          : <button className="button button-primary" type="button" onClick={onStart} disabled={ending}>
            <span aria-hidden="true">{ending ? '…' : mode === 'voice' ? '🎙' : '✎'}</span> {ending ? 'Finishing…' : mode === 'voice' ? 'Start call' : 'Start chat'}
          </button>}
      </div>
      {active && <span className={`call-live-label live-${status.toLowerCase()}`}><i aria-hidden="true" /> {mode === 'chat' && status === 'Idle' ? 'Chat open' : status}</span>}
    </section>
  );
}
