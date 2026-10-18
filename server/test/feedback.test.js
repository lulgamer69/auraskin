import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import Database from 'better-sqlite3';
import { createFeedbackService } from '../src/services/feedbackService.js';
import { createApp } from '../src/app.js';

test('feedback is stored once per call and negative ratings need an improvement note', () => {
  const database = new Database(':memory:');
  const feedback = createFeedbackService({ database });
  assert.throws(() => feedback.submit({ sessionId: 'feedback-test-1', rating: 'down', comment: '' }), (error) => error.code === 'FEEDBACK_COMMENT_REQUIRED');
  const saved = feedback.submit({ sessionId: 'feedback-test-1', rating: 'down', comment: '  The answer was unclear.  ' });
  assert.equal(saved.rating, 'down');
  assert.equal(saved.comment, 'The answer was unclear.');
  assert.throws(() => feedback.submit({ sessionId: 'feedback-test-1', rating: 'up' }), (error) => error.code === 'FEEDBACK_ALREADY_SUBMITTED');
  database.close();
});

test('feedback endpoint accepts reviews only after the call ends', async (t) => {
  let callEnded = false;
  const feedbackService = createFeedbackService({ database: new Database(':memory:') });
  const server = createServer(createApp({
    feedbackService,
    conversationService: { hasEndedSession: () => callEnded },
  }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}/api/feedback`;
  const payload = { sessionId: 'feedback-api-123', rating: 'up', comment: '' };
  const early = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(early.status, 409);
  callEnded = true;
  const accepted = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).data.rating, 'up');
});
