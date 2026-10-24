import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createWebHistoryController } from '../controllers/webHistoryController.js';
import { requireDeviceAuth } from '../middleware/requireDeviceAuth.js';
import { requireParentAuth } from '../middleware/requireParentAuth.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateObjectIdParam } from '../middleware/validateObjectIdParam.js';
import { getSessionCookieName } from '../utils/sessionCookie.js';
import { ingestWebHistorySchema } from '../validators/webHistoryValidators.js';

const rateLimitResponse = {
  ok: false,
  error: { message: 'Too many web history requests. Try again later.' },
};

function createWebHistoryRateLimit({ limit = 120, windowMs = 15 * 60 * 1000, store } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: rateLimitResponse,
    ...(store ? { store } : {}),
  });
}

export function createWebHistoryRouter({
  authService,
  devicePairingService,
  webHistoryService,
  nodeEnv,
  rateLimitConfig = {},
}) {
  const router = Router();
  const controller = createWebHistoryController({ webHistoryService });
  const requireAuth = requireParentAuth(authService, {
    cookieName: getSessionCookieName(nodeEnv),
    nodeEnv,
  });

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  });

  // Device route: upload web history from paired Chrome extension
  router.post(
    '/devices/web-history',
    createWebHistoryRateLimit(rateLimitConfig.webHistory),
    requireDeviceAuth(devicePairingService),
    validateBody(ingestWebHistorySchema),
    controller.ingest
  );

  // Parent routes: view history and summary metrics
  router.get(
    '/children/:childId/web-history',
    requireAuth,
    validateObjectIdParam('childId'),
    controller.getByChild
  );

  router.get(
    '/children/:childId/web-history/summary',
    requireAuth,
    validateObjectIdParam('childId'),
    controller.getSummary
  );

  return router;
}
