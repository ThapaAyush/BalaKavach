import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createScreenTimeController } from '../controllers/screenTimeController.js';
import { requireDeviceAuth } from '../middleware/requireDeviceAuth.js';
import { requireParentAuth } from '../middleware/requireParentAuth.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateObjectIdParam } from '../middleware/validateObjectIdParam.js';
import { getSessionCookieName } from '../utils/sessionCookie.js';
import { ingestScreenTimeSchema } from '../validators/screenTimeValidators.js';

const rateLimitResponse = {
  ok: false,
  error: { message: 'Too many screen-time requests. Try again later.' },
};

function createScreenTimeRateLimit({ limit = 60, windowMs = 15 * 60 * 1000, store } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: rateLimitResponse,
    ...(store ? { store } : {}),
  });
}

export function createScreenTimeRouter({
  authService,
  devicePairingService,
  screenTimeService,
  nodeEnv,
  rateLimitConfig = {},
}) {
  const router = Router();
  const controller = createScreenTimeController({ screenTimeService });
  const requireAuth = requireParentAuth(authService, {
    cookieName: getSessionCookieName(nodeEnv),
    nodeEnv,
  });

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  });

  // Device route: upload usage
  router.post(
    '/devices/screen-time',
    createScreenTimeRateLimit(rateLimitConfig.screenTime),
    requireDeviceAuth(devicePairingService),
    validateBody(ingestScreenTimeSchema),
    controller.ingest,
  );

  // Parent routes: view usage and history
  router.get(
    '/children/:childId/screen-time',
    requireAuth,
    validateObjectIdParam('childId'),
    controller.getByChildAndDate,
  );
  router.get(
    '/children/:childId/screen-time/history',
    requireAuth,
    validateObjectIdParam('childId'),
    controller.getHistory,
  );

  return router;
}
