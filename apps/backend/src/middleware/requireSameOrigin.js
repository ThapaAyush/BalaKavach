export function requireSameOrigin(clientOrigin) {
  const allowed = Array.isArray(clientOrigin)
    ? clientOrigin
    : typeof clientOrigin === 'string'
      ? clientOrigin.split(',').map((o) => o.trim().replace(/\/+$/, ''))
      : [];

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
