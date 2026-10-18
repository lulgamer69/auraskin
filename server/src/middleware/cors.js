const defaultOrigins = [
  'https://auraskin-steel.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function createCorsMiddleware(origins) {
  const environmentOrigins = process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
    : [];
  const configuredOrigins = origins ?? [...defaultOrigins, ...environmentOrigins];
  const allowedOrigins = new Set(configuredOrigins);

  return function corsMiddleware(req, res, next) {
    const origin = req.get('Origin');
    if (!origin) return next();
    if (!allowedOrigins.has(origin)) return next();

    res.vary('Origin');
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  };
}
