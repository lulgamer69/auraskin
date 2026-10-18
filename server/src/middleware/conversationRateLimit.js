const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 30;

/** A small process-local guard for the AI conversation endpoints. */
export function createConversationRateLimit({ windowMs = DEFAULT_WINDOW_MS, limit = DEFAULT_LIMIT } = {}) {
  const clients = new Map();

  return function conversationRateLimit(req, res, next) {
    const now = Date.now();
    for (const [address, bucket] of clients) {
      if (bucket.resetAt <= now) clients.delete(address);
    }

    const address = req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = clients.get(address);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      clients.set(address, bucket);
    }
    bucket.count += 1;
    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    if (bucket.count > limit) {
      return res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'There have been too many call requests. Please wait a minute and try again.' },
      });
    }
    return next();
  };
}
