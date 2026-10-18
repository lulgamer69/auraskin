import express from 'express';
import { createOrderController } from './controllers/orderController.js';
import { createPolicyController } from './controllers/policyController.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { createOrderRoutes } from './routes/orderRoutes.js';
import { createPolicyRoutes } from './routes/policyRoutes.js';
import { createOrderService } from './services/orderService.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { createConversationController } from './controllers/conversationController.js';
import { createConversationRoutes } from './routes/conversationRoutes.js';
import { createConversationService } from './services/conversationService.js';
import { createConversationRateLimit } from './middleware/conversationRateLimit.js';
import { createFeedbackController } from './controllers/feedbackController.js';
import { createFeedbackRoutes } from './routes/feedbackRoutes.js';
import { createFeedbackService } from './services/feedbackService.js';

const defaultFeedbackService = createFeedbackService();

export function createApp({ orderService = createOrderService(), conversationService = createConversationService({ orderService }), feedbackService = defaultFeedbackService, conversationRateLimit = createConversationRateLimit(), allowedOrigins } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(createCorsMiddleware(allowedOrigins));
  app.use(express.json({ limit: '10kb', strict: true }));
  app.get('/api/health', (req, res) => res.json({ data: { status: 'ok' } }));
  app.use('/api/orders', createOrderRoutes(createOrderController(orderService)));
  app.use('/api/policies', createPolicyRoutes(createPolicyController()));
  app.use('/api/conversations', conversationRateLimit, createConversationRoutes(createConversationController(conversationService)));
  app.use('/api/feedback', conversationRateLimit, createFeedbackRoutes(createFeedbackController(feedbackService, conversationService)));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
