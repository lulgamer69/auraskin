import { Router } from 'express';

export function createFeedbackRoutes(controller) {
  const router = Router();
  router.post('/', controller.submit);
  return router;
}
