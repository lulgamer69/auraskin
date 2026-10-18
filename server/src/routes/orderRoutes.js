import { Router } from 'express';

export function createOrderRoutes(controller) {
  const router = Router();
  router.get('/', controller.getOrderByQuery);
  router.get('/:orderId', controller.getOrder);
  router.post('/:orderId/cancel', controller.cancelOrder);
  return router;
}
