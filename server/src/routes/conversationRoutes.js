import { Router } from 'express';

export function createConversationRoutes(controller) {
  const router = Router();
  router.post('/:sessionId/turn', controller.turn);
  router.post('/:sessionId/speech', controller.speech);
  router.post('/:sessionId/end', controller.end);
  return router;
}
