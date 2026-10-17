import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createAuthController } from '../controllers/authController.js';
import { requireParentAuth } from '../middleware/requireParentAuth.js';
import { requireSameOrigin } from '../middleware/requireSameOrigin.js';
import { validateBody } from '../middleware/validateBody.js';
import { getSessionCookieName } from '../utils/sessionCookie.js';
import { loginSchema, registrationSchema } from '../validators/authValidators.js';

export function createAuthRouter({ authService, clientOrigin, nodeEnv, sameSite = 'strict' }) {
  const router = Router();
  const cookieName = getSessionCookieName(nodeEnv);
  const controller = createAuthController({ authService, cookieName, nodeEnv, sameSite });
  const requireAuth = requireParentAuth(authService, { cookieName, nodeEnv });
  const sameOrigin = requireSameOrigin(clientOrigin);
  const credentialRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { ok: false, error: { message: 'Too many authentication attempts. Try again later.' } },
  });
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  });

  router.post('/register', sameOrigin, credentialRateLimit, validateBody(registrationSchema), controller.register);
  router.post('/login', sameOrigin, credentialRateLimit, validateBody(loginSchema), controller.login);
  router.post('/logout', sameOrigin, controller.logout);
  router.get('/me', requireAuth, controller.currentParent);

  return router;
}
