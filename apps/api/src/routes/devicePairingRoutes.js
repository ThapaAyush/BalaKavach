import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createDevicePairingController } from '../controllers/devicePairingController.js';
import {
  deviceNotFoundError,
  pairingCodeNotFoundError,
} from '../services/devicePairingErrors.js';
import { requireDeviceAuth } from '../middleware/requireDeviceAuth.js';
import { requireParentAuth } from '../middleware/requireParentAuth.js';
import { requireSameOrigin } from '../middleware/requireSameOrigin.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateObjectIdParam } from '../middleware/validateObjectIdParam.js';
import { getSessionCookieName } from '../utils/sessionCookie.js';
import {
  createPairingCodeSchema,
  deviceHeartbeatSchema,
  redeemPairingCodeSchema,
} from '../validators/devicePairingValidators.js';

const limitedResponse = {
  ok: false,
  error: { message: 'Too many pairing attempts. Try again later.' },
};

const heartbeatLimitedResponse = {
  ok: false,
  error: { message: 'Too many heartbeat requests. Try again later.' },
};

function createPairingRateLimit(limit, store) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: limitedResponse,
    ...(store ? { store } : {}),
  });
}

function createHeartbeatRateLimit({ limit = 60, windowMs = 15 * 60 * 1000, store } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: heartbeatLimitedResponse,
    ...(store ? { store } : {}),
  });
}

export function createDevicePairingRouter({
  authService,
  devicePairingService,
  clientOrigin,
  nodeEnv,
  rateLimitConfig = {},
}) {
  const router = Router();
  const controller = createDevicePairingController({ devicePairingService });
  const requireAuth = requireParentAuth(authService, {
    cookieName: getSessionCookieName(nodeEnv),
    nodeEnv,
  });
  const sameOrigin = requireSameOrigin(clientOrigin);

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  });

  router.post(
    '/children/:childId/pairing-codes',
    requireAuth,
    createPairingRateLimit(rateLimitConfig.pairing?.limit ?? 10, rateLimitConfig.pairing?.store),
    sameOrigin,
    validateObjectIdParam('childId'),
    validateBody(createPairingCodeSchema),
    controller.createPairingCode,
  );
  router.delete(
    '/children/:childId/pairing-codes/:pairingCodeId',
    requireAuth,
    sameOrigin,
    validateObjectIdParam('childId'),
    validateObjectIdParam('pairingCodeId', pairingCodeNotFoundError),
    controller.revokePairingCode,
  );
  router.post(
    '/device-pairing/redeem',
    createPairingRateLimit(rateLimitConfig.pairing?.limit ?? 10, rateLimitConfig.pairing?.store),
    validateBody(redeemPairingCodeSchema),
    controller.redeemPairingCode,
  );
  router.post(
    '/devices/heartbeat',
    createHeartbeatRateLimit(rateLimitConfig.heartbeat),
    requireDeviceAuth(devicePairingService),
    validateBody(deviceHeartbeatSchema),
    controller.recordHeartbeat,
  );
  router.get('/devices', requireAuth, controller.listDevices);
  router.delete(
    '/devices/:deviceId',
    requireAuth,
    sameOrigin,
    validateObjectIdParam('deviceId', deviceNotFoundError),
    controller.revokeDevice,
  );

  return router;
}
