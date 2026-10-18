import { HttpError } from '../utils/httpError.js';

export function errorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(error);

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large.' } });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
  }
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({
      error: { code: error.code ?? 'INVALID_REQUEST', message: error.message ?? 'Invalid request.' },
    });
  }

  // Do not send exception details or stack traces to clients.
  console.error('Unhandled backend error:', error);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } });
}
