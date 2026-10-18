import { HttpError } from '../utils/httpError.js';

export function createOrderController(orderService) {
  function sendOrder(orderId, res) {
    const result = orderService.get_order_details(orderId);
    if (result.kind === 'invalid') throw new HttpError(400, 'INVALID_ORDER_ID', result.message);
    if (result.kind === 'not_found') throw new HttpError(404, 'ORDER_NOT_FOUND', 'No order was found for that ID.');
    res.json({ data: result.order });
  }

  function getOrder(req, res) {
    sendOrder(req.params.orderId, res);
  }

  function getOrderByQuery(req, res) {
    if (req.query.orderId === undefined || req.query.orderId === '') {
      throw new HttpError(400, 'MISSING_ORDER_ID', 'Provide an orderId path parameter or query parameter.');
    }
    sendOrder(req.query.orderId, res);
  }

  function cancelOrder(req, res) {
    if (Object.keys(req.body ?? {}).length > 0) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Cancellation does not accept a request body.');
    }
    const result = orderService.cancel_order(req.params.orderId);
    if (result.kind === 'invalid') throw new HttpError(400, 'INVALID_ORDER_ID', result.message);
    if (result.kind === 'not_found') throw new HttpError(404, 'ORDER_NOT_FOUND', 'No order was found for that ID.');
    if (result.kind === 'conflict') throw new HttpError(409, 'CANCELLATION_NOT_ALLOWED', result.reason);
    res.json({ data: result.order, message: 'The mock order was cancelled.' });
  }

  return { getOrder, getOrderByQuery, cancelOrder };
}
