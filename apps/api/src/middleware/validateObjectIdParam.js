import { childProfileNotFoundError } from '../services/familyChildErrors.js';

export function validateObjectIdParam(parameterName) {
  return (req, _res, next) => {
    if (!/^[a-f\d]{24}$/i.test(req.params[parameterName] ?? '')) {
      return next(childProfileNotFoundError());
    }

    return next();
  };
}
