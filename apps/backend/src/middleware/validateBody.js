export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const error = new Error('Invalid request body.');
      error.status = 400;
      return next(error);
    }

    req.validatedBody = result.data;
    return next();
  };
}
