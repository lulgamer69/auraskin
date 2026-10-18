import { copyOrder, initialOrders } from '../data/orders.js';

/** Creates an isolated in-memory order store. Pass fresh records in tests. */
export function createOrderService(seedOrders = initialOrders) {
  const orders = new Map(seedOrders.map((order) => [order.id, copyOrder(order)]));

  function get_order_details(orderId) {
    if (typeof orderId !== 'string' || orderId.length === 0) {
      return { kind: 'invalid', message: 'An order ID is required.' };
    }
    if (!/^ORD-\d{3}$/.test(orderId)) {
      return { kind: 'invalid', message: 'Order ID must use the format ORD-123.' };
    }

    const order = orders.get(orderId);
    return order ? { kind: 'found', order: copyOrder(order) } : { kind: 'not_found' };
  }

  function cancel_order(orderId) {
    const lookup = get_order_details(orderId);
    if (lookup.kind !== 'found') return lookup;

    const current = orders.get(orderId);
    if (current.status === 'Cancelled') {
      return { kind: 'conflict', reason: 'This order has already been cancelled.' };
    }
    if (current.status !== 'Processing') {
      const extra = ['Shipped', 'Out for Delivery'].includes(current.status)
        ? ' The customer may refuse delivery at the doorstep.'
        : '';
      return {
        kind: 'conflict',
        reason: `Cancellation is only available while an order is Processing. Current status: ${current.status}.${extra}`,
      };
    }

    // This check-and-update is synchronous, so requests in this Node process
    // cannot interleave between eligibility checking and the state update.
    current.status = 'Cancelled';
    return { kind: 'cancelled', order: copyOrder(current) };
  }

  return { get_order_details, cancel_order };
}
