export function notFoundHandler(_req, res) {
  res.status(404).json({
    ok: false,
    error: { message: 'Route not found' },
  });
}

export function errorHandler(error, req, res, _next) {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;

  res.status(status).json({
    ok: false,
    error: {
      message: status < 500 ? error.message : 'Internal server error',
      requestId: req.id,
    },
  });
}
