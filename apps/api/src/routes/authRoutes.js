import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthController } from '../controllers/authController.js';
import { requireParentAuth } from '../middleware/requireParentAuth.js';
import { validateBody } from '../middleware/validateBody.js';
import { getSessionCookieName } from '../utils/sessionCookie.js';
import { loginSchema, registrationSchema } from '../validators/authValidators.js';

export function createAuthRouter({ authService, clientOrigin, nodeEnv }) {
  const router = Router();
  const cookieName = getSessionCookieName(nodeEnv);
  const controller = createAuthController({ authService, cookieName, nodeEnv });
  const requireAuth = requireParentAuth(authService, { cookieName, nodeEnv });
  const credentialRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { ok: false, error: { message: 'Too many authentication attempts. Try again later.' } },
  });
  const requireSameOrigin = (req, res, next) => {
    if (req.get('origin') !== clientOrigin) {
      return res.status(403).json({
        ok: false,
        error: { message: 'Request origin is not allowed.' },
      });
    }
    return next();
  };

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  });

  router.post('/register', requireSameOrigin, credentialRateLimit, validateBody(registrationSchema), controller.register);
  router.post('/login', requireSameOrigin, credentialRateLimit, validateBody(loginSchema), controller.login);
  router.post('/logout', requireSameOrigin, controller.logout);
  router.get('/me', requireAuth, controller.currentParent);

  return router;
}
