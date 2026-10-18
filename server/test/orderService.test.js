import test from 'node:test';
import assert from 'node:assert/strict';
import { initialOrders } from '../src/data/orders.js';
import { createOrderService } from '../src/services/orderService.js';

test('order lookup returns all three exact assessment records', () => {
  const service = createOrderService();
  const expected = {
    'ORD-101': ['Priya Sharma', 'Vitamin C Serum (30ml)', 699, 'Out for Delivery', 'BD-982103', 'Expected by 6 PM today'],
    'ORD-102': ['Rahul Verma', 'Hydrating Sunscreen SPF 50', 499, 'Delivered', 'DL-441029', 'Delivered 14 days ago'],
    'ORD-103': ['Ananya Patel', 'Green Tea Face Wash + Toner', 850, 'Processing', null, 'Ordered 3 hours ago. Eligible for cancellation.'],
  };
  for (const [id, [customer, product, amount, status, trackingId, note]] of Object.entries(expected)) {
    const result = service.get_order_details(id);
    assert.equal(result.kind, 'found');
    assert.deepEqual(
      [result.order.customer, result.order.product, result.order.amount, result.order.status, result.order.tracking?.trackingId ?? null, result.order.note],
      [customer, product, amount, status, trackingId, note],
    );
  }
});

test('order lookup rejects missing and malformed IDs and distinguishes unknown IDs', () => {
  const service = createOrderService();
  assert.equal(service.get_order_details(undefined).kind, 'invalid');
  assert.equal(service.get_order_details('').kind, 'invalid');
  assert.equal(service.get_order_details('ORD-1').kind, 'invalid');
  assert.equal(service.get_order_details('ORD-999').kind, 'not_found');
});

test('order lookup returns a copy so callers cannot mutate stored data', () => {
  const service = createOrderService();
  const result = service.get_order_details('ORD-101');
  result.order.status = 'Cancelled';
  result.order.tracking.trackingId = 'changed';
  const reread = service.get_order_details('ORD-101').order;
  assert.equal(reread.status, 'Out for Delivery');
  assert.equal(reread.tracking.trackingId, 'BD-982103');
});

test('cancellation updates only a Processing order and repeated cancellation is rejected', () => {
  const service = createOrderService();
  const result = service.cancel_order('ORD-103');
  assert.equal(result.kind, 'cancelled');
  assert.equal(result.order.status, 'Cancelled');
  assert.equal(service.cancel_order('ORD-103').kind, 'conflict');
  assert.equal(service.get_order_details('ORD-103').order.status, 'Cancelled');
});

test('cancellation rejects an existing but ineligible order without changing it', () => {
  const service = createOrderService();
  const result = service.cancel_order('ORD-101');
  assert.equal(result.kind, 'conflict');
  assert.match(result.reason, /refuse delivery at the doorstep/);
  assert.equal(service.get_order_details('ORD-101').order.status, 'Out for Delivery');
});

test('cancellation rejects all non-Processing statuses without changing the records', () => {
  for (const status of ['Shipped', 'Delivered']) {
    const testOrders = initialOrders.map((order) => ({ ...order, tracking: order.tracking ? { ...order.tracking } : null }));
    testOrders[0].status = status;
    const service = createOrderService(testOrders);
    assert.equal(service.cancel_order('ORD-101').kind, 'conflict');
    assert.equal(service.get_order_details('ORD-101').order.status, status);
  }
});

test('cancellation reports invalid and unknown IDs safely', () => {
  const service = createOrderService();
  assert.equal(service.cancel_order('').kind, 'invalid');
  assert.equal(service.cancel_order('ORD-999').kind, 'not_found');
});

test('test cancellation data is isolated from the assessment fixture', () => {
  const testOrders = initialOrders.map((order) => ({ ...order, tracking: order.tracking ? { ...order.tracking } : null }));
  const service = createOrderService(testOrders);
  service.cancel_order('ORD-103');
  assert.equal(initialOrders.find((order) => order.id === 'ORD-103').status, 'Processing');
});
