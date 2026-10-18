import { useEffect, useState } from 'react';

export default function ChatComposer({ active, busy, onSend }) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!active) setMessage('');
  }, [active]);

  function submit(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text || !active || busy) return;
    onSend(text);
    setMessage('');
  }

  if (!active) return null;

  return (
    <form className="chat-composer" onSubmit={submit} aria-label="Message Aria">
      <label className="sr-only" htmlFor="chat-message">Type your question</label>
      <input
        id="chat-message"
        type="text"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Type a message about an Aura order…"
        maxLength={1200}
        disabled={busy}
        autoComplete="off"
      />
      <button className="button button-primary" type="submit" disabled={busy || !message.trim()}>
        {busy ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
