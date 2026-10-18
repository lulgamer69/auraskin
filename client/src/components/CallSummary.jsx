import CallFeedback from './CallFeedback.jsx';

export default function CallSummary({ summary, loading, hasConversation, onRetry, sessionId, callEnded }) {
  return (
    <section className="panel summary-panel" aria-labelledby="summary-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">YOUR SUPPORT NOTES</p>
          <h2 id="summary-title">Call recap</h2>
        </div>
      </div>
      {loading ? (
        <p className="summary-placeholder" role="status">Preparing your call recap…</p>
      ) : summary ? (
        <div className="call-summary-details">
          <div><span>What you needed</span><strong>{summary.customer_intent.replaceAll('_', ' ')}</strong></div>
          {summary.order_id && <div><span>Order</span><strong>{summary.order_id}</strong></div>}
          <div><span>Outcome</span><strong>{summary.resolution_status.replaceAll('_', ' ')}</strong></div>
          <p>{summary.call_summary}</p>
          {summary.next_steps.length > 0 && (
            <div><span>Next steps</span><ul>{summary.next_steps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ul></div>
          )}
        </div>
      ) : (
        <div className="summary-placeholder">
          <span className="note-mark" aria-hidden="true">✳</span>
          <div>
            <strong>{hasConversation ? 'Recap not ready yet' : 'Nothing to recap yet'}</strong>
            <p>{hasConversation ? 'Your conversation is saved above. The recap could not be prepared yet.' : 'After your first conversation, a short recap and any next steps will appear here.'}</p>
            {hasConversation && <button className="text-button" type="button" onClick={onRetry}>Try recap again</button>}
          </div>
        </div>
      )}
      <CallFeedback sessionId={sessionId} visible={callEnded} />
    </section>
  );
}
