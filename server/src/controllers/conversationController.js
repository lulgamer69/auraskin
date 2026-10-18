import { HttpError } from '../utils/httpError.js';

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function createConversationController(conversationService) {
  function validateSessionId(sessionId) {
    if (!SESSION_ID_PATTERN.test(sessionId ?? '')) {
      throw new HttpError(400, 'INVALID_SESSION_ID', 'The call session ID is invalid. Start a new call and try again.');
    }
  }

  return {
    async turn(req, res) {
      validateSessionId(req.params.sessionId);
      const result = await conversationService.sendTurn(req.params.sessionId, req.body?.text, req.body?.alternatives);
      res.json({ data: result });
    },
    async speech(req, res) {
      validateSessionId(req.params.sessionId);
      const result = await conversationService.synthesizeSpeech(req.params.sessionId);
      res.json({ data: result });
    },
    async end(req, res) {
      validateSessionId(req.params.sessionId);
      const result = await conversationService.endConversation(req.params.sessionId);
      res.json({ data: result });
    },
  };
}
