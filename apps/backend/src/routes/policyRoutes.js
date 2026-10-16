import { Router } from 'express';
import { createPolicyController } from '../controllers/policyController.js';
import { requireDeviceAuth } from '../middleware/requireDeviceAuth.js';
import { requireParentAuth } from '../middleware/requireParentAuth.js';
import { requireSameOrigin } from '../middleware/requireSameOrigin.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateObjectIdParam } from '../middleware/validateObjectIdParam.js';
import { getSessionCookieName } from '../utils/sessionCookie.js';
import { acknowledgePolicySchema, updatePolicySchema } from '../validators/policyValidators.js';

export function createPolicyRouter({
  authService,
  devicePairingService,
  policyService,
  clientOrigin,
  nodeEnv,
}) {
  const router = Router();
  const controller = createPolicyController({ policyService });
  const requireAuth = requireParentAuth(authService, {
    cookieName: getSessionCookieName(nodeEnv),
    nodeEnv,
  });
  const sameOrigin = requireSameOrigin(clientOrigin);

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  });

  // Parent routes
  router.get(
    '/children/:childId/policy',
    requireAuth,
    validateObjectIdParam('childId'),
    controller.get,
  );
  router.put(
    '/children/:childId/policy',
    requireAuth,
    sameOrigin,
    validateObjectIdParam('childId'),
    validateBody(updatePolicySchema),
    controller.update,
  );

  // Device routes
  router.get(
    '/devices/policy',
    requireDeviceAuth(devicePairingService),
    controller.getDevicePolicy,
  );
  router.post(
    '/devices/policy/ack',
    requireDeviceAuth(devicePairingService),
    validateBody(acknowledgePolicySchema),
    controller.acknowledgeDevicePolicy,
  );

  return router;
}
