import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { createOrderService } from '../src/services/orderService.js';
import { initialOrders } from '../src/data/orders.js';

async function withServer(t, options) {
  const server = createServer(createApp(options));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function request(baseUrl, path, { method = 'GET', body, rawBody } = {}) {
  const headers = {};
  let bodyText;
  if (rawBody !== undefined) {
    headers['content-type'] = 'application/json';
    bodyText = rawBody;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    bodyText = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: bodyText });
  return { status: response.status, body: await response.json() };
}

test('health and all sample order endpoints return documented JSON envelopes', async (t) => {
  const baseUrl = await withServer(t);
  assert.deepEqual(await request(baseUrl, '/api/health'), { status: 200, body: { data: { status: 'ok' } } });
  for (const order of initialOrders) {
    const response = await request(baseUrl, `/api/orders/${order.id}`);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, order);
  }
});

test('CORS allows local Vite origin and preflight without reflecting unknown origins', async (t) => {
  const baseUrl = await withServer(t);
  const allowed = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const deployedFrontend = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://auraskin-steel.vercel.app' },
  });
  assert.equal(deployedFrontend.headers.get('access-control-allow-origin'), 'https://auraskin-steel.vercel.app');
  const preflight = await fetch(`${baseUrl}/api/policies/shipping`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://auraskin-steel.vercel.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
  const rejected = await fetch(`${baseUrl}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('order endpoint distinguishes malformed and unknown IDs', async (t) => {
  const baseUrl = await withServer(t);
  const missing = await request(baseUrl, '/api/orders');
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, 'MISSING_ORDER_ID');
  assert.equal((await request(baseUrl, '/api/orders?orderId=')).status, 400);
  assert.equal((await request(baseUrl, '/api/orders?orderId=ORD-101')).status, 200);
  assert.deepEqual(await request(baseUrl, '/api/orders/not-an-order'), {
    status: 400,
    body: { error: { code: 'INVALID_ORDER_ID', message: 'Order ID must use the format ORD-123.' } },
  });
  assert.equal((await request(baseUrl, '/api/orders/ORD-999')).status, 404);
});

test('policy endpoints report exact boundaries and reject invalid input', async (t) => {
  const baseUrl = await withServer(t);
  const exactBoundary = await request(baseUrl, '/api/policies/shipping', { method: 'POST', body: { orderTotal: 499 } });
  assert.equal(exactBoundary.status, 200);
  assert.equal(exactBoundary.body.data.status, 'unspecified');
  assert.equal(exactBoundary.body.data.shippingFee, null);

  const invalid = await request(baseUrl, '/api/policies/shipping', { method: 'POST', body: { orderTotal: '499' } });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_POLICY_INPUT');

  const cod = await request(baseUrl, '/api/policies/cash-on-delivery', {
    method: 'POST', body: { orderTotal: 2500, paymentMethod: 'upi' },
  });
  assert.equal(cod.status, 200);
  assert.equal(cod.body.data.eligible, true);
});

test('return and damage policy endpoints validate all required input fields', async (t) => {
  const baseUrl = await withServer(t);
  const returns = await request(baseUrl, '/api/policies/returns', {
    method: 'POST', body: { daysSinceDelivery: 7, opened: false, used: false, originalPackaging: true },
  });
  assert.equal(returns.status, 200);
  assert.equal(returns.body.data.eligible, true);
  const missingPhotos = await request(baseUrl, '/api/policies/damaged-product', {
    method: 'POST', body: { hoursSinceDelivery: 24, photosProvided: false },
  });
  assert.equal(missingPhotos.status, 200);
  assert.equal(missingPhotos.body.data.eligible, false);
  const missingFields = await request(baseUrl, '/api/policies/returns', { method: 'POST', body: {} });
  assert.equal(missingFields.status, 400);
});

test('cancellation API updates only Processing orders and handles repeats as conflict', async (t) => {
  const isolatedOrders = initialOrders.map((order) => ({ ...order, tracking: order.tracking ? { ...order.tracking } : null }));
  const baseUrl = await withServer(t, { orderService: createOrderService(isolatedOrders) });
  const success = await request(baseUrl, '/api/orders/ORD-103/cancel', { method: 'POST' });
  assert.equal(success.status, 200);
  assert.equal(success.body.data.status, 'Cancelled');
  const repeated = await request(baseUrl, '/api/orders/ORD-103/cancel', { method: 'POST' });
  assert.equal(repeated.status, 409);
  const ineligible = await request(baseUrl, '/api/orders/ORD-101/cancel', { method: 'POST' });
  assert.equal(ineligible.status, 409);
  const wrongBody = await request(baseUrl, '/api/orders/ORD-103/cancel', { method: 'POST', body: { force: true } });
  assert.equal(wrongBody.status, 400);
});

test('concurrent duplicate cancellation requests produce one success and one conflict', async (t) => {
  const baseUrl = await withServer(t);
  const results = await Promise.all([
    request(baseUrl, '/api/orders/ORD-103/cancel', { method: 'POST' }),
    request(baseUrl, '/api/orders/ORD-103/cancel', { method: 'POST' }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await request(baseUrl, '/api/orders/ORD-103')).body.data.status, 'Cancelled');
});

test('unexpected service errors return a generic response without internal details', async (t) => {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const baseUrl = await withServer(t, {
      orderService: { get_order_details() { throw new Error('private test detail'); } },
    });
    const response = await request(baseUrl, '/api/orders/ORD-101');
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
    });
    assert.doesNotMatch(JSON.stringify(response.body), /private test detail/);
  } finally {
    console.error = originalConsoleError;
  }
});

test('malformed JSON and unknown routes receive safe, consistent errors', async (t) => {
  const baseUrl = await withServer(t);
  const malformed = await request(baseUrl, '/api/policies/shipping', { method: 'POST', rawBody: '{' });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  assert.equal((await request(baseUrl, '/no-such-route')).body.error.code, 'ROUTE_NOT_FOUND');
  assert.equal((await request(baseUrl, '/no-such-route')).body.error.stack, undefined);
});
