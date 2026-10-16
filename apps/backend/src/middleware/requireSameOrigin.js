export function requireSameOrigin(clientOrigin) {
  return (req, res, next) => {
    if (req.get('origin') !== clientOrigin) {
      return res.status(403).json({
        ok: false,
        error: { message: 'Request origin is not allowed.' },
      });
    }

    return next();
  };
}
