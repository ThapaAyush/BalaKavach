import { childProfileNotFoundError } from '../services/familyChildErrors.js';

export function validateObjectIdParam(parameterName, notFoundError = childProfileNotFoundError) {
  return (req, _res, next) => {
    if (!/^[a-f\d]{24}$/i.test(req.params[parameterName] ?? '')) {
      return next(notFoundError());
    }

    return next();
  };
}
