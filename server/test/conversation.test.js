import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { createConversationService } from '../src/services/conversationService.js';
import { createOrderService } from '../src/services/orderService.js';
import { initialOrders } from '../src/data/orders.js';
import { createConversationRateLimit } from '../src/middleware/conversationRateLimit.js';

async function withServer(t, options = {}) {
  const server = createServer(createApp(options));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

async function post(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

test('conversation API validates session IDs and returns a clear error without a Groq key', async (t) => {
  const baseUrl = await withServer(t);
  assert.deepEqual(await post(baseUrl, '/api/conversations/no/turn', { text: 'hello' }), {
    status: 400,
    body: { error: { code: 'INVALID_SESSION_ID', message: 'The call session ID is invalid. Start a new call and try again.' } },
  });
  const missingKey = await post(baseUrl, '/api/conversations/test-session-123/turn', { text: 'hello' });
  assert.equal(missingKey.status, 503);
  assert.equal(missingKey.body.error.code, 'GROQ_NOT_CONFIGURED');
  const empty = await post(baseUrl, '/api/conversations/test-session-123/turn', { text: '   ' });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, 'MISSING_MESSAGE');
});

test('Groq function call uses the trusted order service and records the assistant turn', async (t) => {
  let modelRequestCount = 0;
  const generateContent = async (request) => {
    modelRequestCount += 1;
    if (modelRequestCount === 1) {
      const functionCall = { name: 'get_order_details', args: { orderId: 'ORD-101' }, id: 'lookup-1' };
      return {
        functionCalls: [functionCall],
        candidates: [{ content: { role: 'model', parts: [{ functionCall }] } }],
      };
    }
    if (modelRequestCount === 2) {
      assert.ok(request.contents.some((content) => content.parts?.some((part) => part.functionResponse?.name === 'get_order_details')));
      const answer = 'ORD-101 is out for delivery and expected by 6 PM today.';
      return { text: answer, candidates: [{ content: { role: 'model', parts: [{ text: answer }] } }] };
    }
    const summary = {
      customer_intent: 'ORDER_TRACKING',
      order_id: 'ORD-101',
      resolution_status: 'RESOLVED',
      call_summary: 'The customer asked for the delivery status of ORD-101.',
      next_steps: [],
    };
    return { text: JSON.stringify(summary) };
  };
  const orderService = createOrderService(initialOrders.map((order) => ({ ...order, tracking: order.tracking ? { ...order.tracking } : null })));
  const conversationService = createConversationService({ generateContent, orderService });
  const baseUrl = await withServer(t, { orderService, conversationService });

  const turn = await post(baseUrl, '/api/conversations/test-session-123/turn', { text: 'Where is ORD-101?' });
  assert.equal(turn.status, 200);
  assert.equal(turn.body.data.reply, 'ORD-101 is out for delivery and expected by 6 PM today.');
  assert.deepEqual(turn.body.data.toolsUsed, ['get_order_details']);
  assert.equal(turn.body.data.transcript.length, 2);
  assert.equal(modelRequestCount, 2);

  const ended = await post(baseUrl, '/api/conversations/test-session-123/end');
  assert.equal(ended.status, 200);
  assert.equal(ended.body.data.summary.resolution_status, 'RESOLVED');
  assert.equal(ended.body.data.summary.order_id, 'ORD-101');

  const repeatedEnd = await post(baseUrl, '/api/conversations/test-session-123/end');
  assert.equal(repeatedEnd.body.data.summary.call_summary, ended.body.data.summary.call_summary);
  const afterEnd = await post(baseUrl, '/api/conversations/test-session-123/turn', { text: 'One more question.' });
  assert.equal(afterEnd.status, 409);
  assert.equal(afterEnd.body.error.code, 'CONVERSATION_ENDED');
});

test('conversation inputs are bounded and empty calls cannot be summarized', async (t) => {
  const conversationService = createConversationService({ generateContent: async () => ({ text: 'ok' }) });
  const baseUrl = await withServer(t, { conversationService });
  const tooLong = await post(baseUrl, '/api/conversations/test-session-456/turn', { text: 'x'.repeat(1201) });
  assert.equal(tooLong.status, 413);
  const emptySummary = await post(baseUrl, '/api/conversations/empty-session-123/end');
  assert.equal(emptySummary.status, 404);
});

test('conversation endpoints return 429 after the configured request limit', async (t) => {
  let downstreamCalls = 0;
  const conversationService = {
    sendTurn: async (sessionId, text) => {
      downstreamCalls += 1;
      return { sessionId, reply: text, transcript: [], toolsUsed: [] };
    },
    endConversation: async () => ({ summary: {}, transcript: [] }),
  };
  const baseUrl = await withServer(t, {
    conversationService,
    conversationRateLimit: createConversationRateLimit({ limit: 1, windowMs: 60_000 }),
  });

  const first = await post(baseUrl, '/api/conversations/rate-test-123/turn', { text: 'hello' });
  const second = await post(baseUrl, '/api/conversations/rate-test-456/turn', { text: 'again' });
  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.equal(second.body.error.code, 'RATE_LIMITED');
  assert.equal(downstreamCalls, 1);
});

test('assistant can close a clearly finished call and the session then rejects new turns', async () => {
  let modelRequestCount = 0;
  const generateContent = async () => {
    modelRequestCount += 1;
    if (modelRequestCount === 1) {
      const functionCall = { name: 'end_call', args: {}, id: 'finish-1' };
      return { functionCalls: [functionCall], candidates: [{ content: { role: 'model', parts: [{ functionCall }] } }] };
    }
    if (modelRequestCount === 2) {
      return { text: 'You’re very welcome. Take care, and enjoy your Aura skincare.' };
    }
    return { text: JSON.stringify({
      customer_intent: 'GENERAL_SUPPORT',
      order_id: '',
      resolution_status: 'RESOLVED',
      call_summary: 'The customer finished their support conversation.',
      next_steps: [],
    }) };
  };
  const conversationService = createConversationService({ generateContent });
  const sessionId = 'finish-session-123';
  const turn = await conversationService.sendTurn(sessionId, 'No, that’s all. Thank you.');
  assert.equal(turn.callEnded, true);
  assert.match(turn.reply, /Take care/);

  const ended = await conversationService.endConversation(sessionId);
  assert.equal(ended.summary.resolution_status, 'RESOLVED');
  await assert.rejects(
    conversationService.sendTurn(sessionId, 'One more thing.'),
    (error) => error.status === 409 && error.code === 'CONVERSATION_ENDED',
  );
});

test('a spoken goodbye closes the call even when Groq skips the end-call tool', async () => {
  const generateContent = async (request) => request.config?.responseSchema
    ? { text: JSON.stringify({ customer_intent: 'GENERAL_SUPPORT', order_id: '', resolution_status: 'RESOLVED', call_summary: 'The customer thanked Aria and the call ended.', next_steps: [] }) }
    : { text: 'You’re very welcome. Have a wonderful day ahead!' };
  const service = createConversationService({ generateContent });
  const result = await service.sendTurn('farewell-test-123', 'ok thank you for your assistance');
  assert.equal(result.callEnded, true);
  assert.equal(service.hasEndedSession('farewell-test-123'), true);
  await service.endConversation('farewell-test-123');
  await assert.rejects(service.sendTurn('farewell-test-123', 'hello again'), (error) => error.code === 'CONVERSATION_ENDED');
});

test('speech generation reads the latest assistant reply without delaying the turn response', async () => {
  const spoken = [];
  const service = createConversationService({
    generateContent: async () => ({ text: 'Your order is on the way.' }),
    synthesizeSpeech: async (text) => { spoken.push(text); return 'd2F2'; },
  });
  const result = await service.sendTurn('speech-test-123', 'Where is ORD-101?');
  assert.equal(result.reply, 'Your order is on the way.');
  assert.equal('audioData' in result, false);
  assert.deepEqual(await service.synthesizeSpeech('speech-test-123'), { audioData: 'd2F2' });
  assert.deepEqual(spoken, ['Your order is on the way.']);
});

test('Groq quota errors give the customer an actionable message', async () => {
  const error = Object.assign(new Error('quota detail'), { status: 429 });
  const service = createConversationService({ generateContent: async () => { throw error; } });
  await assert.rejects(
    service.sendTurn('quota-test-123', 'Where is my order?'),
    (failure) => failure.code === 'GROQ_RATE_LIMITED' && /quota is used/i.test(failure.message),
  );
});
