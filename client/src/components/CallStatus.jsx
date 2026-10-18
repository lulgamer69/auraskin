const stateDescriptions = {
  Idle: 'Ready to help when you are.',
  Listening: 'Listening for your question.',
  Reviewing: 'Check the transcript and edit any words before sending.',
  Thinking: 'Checking Aura’s order and policy information.',
  Speaking: 'Aria is replying aloud.',
};

export default function CallStatus({ status, callActive, mode = 'voice' }) {
  const stateClass = status.toLowerCase();

  return (
    <section className="panel status-panel" aria-labelledby="status-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{mode === 'chat' ? 'MESSAGE SUPPORT' : 'VOICE HELP'}</p>
          <h2 id="status-title">{mode === 'chat' ? 'Chat status' : 'Call status'}</h2>
        </div>
        <span className={`status-pill status-${stateClass}`}>
          <span className="status-dot" aria-hidden="true" /> {callActive && mode === 'chat' && status === 'Idle' ? 'Chat open' : status}
        </span>
      </div>
      <p className="muted" aria-live="polite">{callActive
        ? mode === 'chat'
          ? status === 'Thinking' ? 'Aria is writing a reply.' : 'Type a message whenever you’re ready.'
          : stateDescriptions[status]
        : 'Choose voice or chat to get help from Aria. You can still browse orders and check policies anytime.'}</p>
    </section>
  );
}
