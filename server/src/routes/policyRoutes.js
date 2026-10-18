import { Router } from 'express';

export function createPolicyRoutes(controller) {
  const router = Router();
  router.post('/shipping', controller.shipping);
  router.post('/returns', controller.returns);
  router.post('/damaged-product', controller.damagedProduct);
  router.post('/cash-on-delivery', controller.cashOnDelivery);
  return router;
}
