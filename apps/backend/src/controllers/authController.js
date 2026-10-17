import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from '../utils/sessionCookie.js';

export function createAuthController({ authService, cookieName, nodeEnv, sameSite = 'strict' }) {
  return Object.freeze({
    async register(req, res, next) {
      try {
        await authService.register(req.validatedBody);
        return res.status(202).json({
          ok: true,
          data: { message: 'Registration request received. You can try signing in.' },
        });
      } catch (error) {
        return next(error);
      }
    },

    async login(req, res, next) {
      try {
        const session = await authService.login(req.validatedBody);
        setSessionCookie(
          res,
          cookieName,
          session.token,
          Math.max(0, session.expiresAt.getTime() - Date.now()),
          nodeEnv,
          sameSite,
        );
        return res.status(200).json({ ok: true, data: { parent: session.parent } });
      } catch (error) {
        return next(error);
      }
    },

    async logout(req, res, next) {
      try {
        await authService.logout(readSessionToken(req, cookieName));
        clearSessionCookie(res, cookieName, nodeEnv, sameSite);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    },

    currentParent(req, res) {
      return res.status(200).json({ ok: true, data: { parent: req.parent } });
    },
  });
}
