import { HttpError } from '../utils/httpError.js';

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function createFeedbackController(feedbackService, conversationService) {
  return {
    submit(req, res) {
      const { sessionId, rating, comment } = req.body ?? {};
      if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
        throw new HttpError(400, 'INVALID_SESSION_ID', 'The call session ID is invalid.');
      }
      if (!conversationService.hasEndedSession(sessionId)) {
        throw new HttpError(409, 'CALL_NOT_ENDED', 'Finish the call before sending feedback.');
      }
      const feedback = feedbackService.submit({ sessionId, rating, comment });
      res.status(201).json({ data: feedback });
    },
  };
}
