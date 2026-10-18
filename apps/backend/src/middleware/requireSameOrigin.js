export function requireSameOrigin(clientOrigin) {
  const customAllowed = Array.isArray(clientOrigin)
    ? clientOrigin
    : typeof clientOrigin === 'string'
      ? clientOrigin.split(',').map((o) => o.trim().replace(/\/+$/, ''))
      : [clientOrigin].filter(Boolean);

  const defaultOrigins = [
    'https://bala-kavach-fe.vercel.app',
    'http://localhost:5173',
  ];

  const allowed = Array.from(new Set([
    ...defaultOrigins,
    ...customAllowed,
  ]));

  return (req, res, next) => {
    const origin = req.get('origin');
    if (!origin || !allowed.includes(origin)) {
      return res.status(403).json({
        ok: false,
        error: { message: 'Request origin is not allowed.' },
      });
    }

    return next();
  };
}
