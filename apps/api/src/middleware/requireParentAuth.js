import { clearSessionCookie, readSessionToken } from '../utils/sessionCookie.js';

export function requireParentAuth(authService, { cookieName, nodeEnv }) {
  return async (req, res, next) => {
    const token = readSessionToken(req, cookieName);
    if (!token) {
      clearSessionCookie(res, cookieName, nodeEnv);
      return res.status(401).json({
        ok: false,
        error: { message: 'Authentication required.' },
      });
    }

    try {
      const parent = await authService.authenticate(token);
      if (!parent) {
        clearSessionCookie(res, cookieName, nodeEnv);
        return res.status(401).json({
          ok: false,
          error: { message: 'Authentication required.' },
        });
      }

      req.parent = parent;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
