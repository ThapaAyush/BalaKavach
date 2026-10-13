import { Router } from 'express';
import { createChildController } from '../controllers/childController.js';
import { requireParentAuth } from '../middleware/requireParentAuth.js';
import { requireSameOrigin } from '../middleware/requireSameOrigin.js';
import { validateBody } from '../middleware/validateBody.js';
import { validateObjectIdParam } from '../middleware/validateObjectIdParam.js';
import { getSessionCookieName } from '../utils/sessionCookie.js';
import { createChildProfileSchema, updateChildProfileSchema } from '../validators/childValidators.js';

export function createChildRouter({ authService, familyChildService, clientOrigin, nodeEnv }) {
  const router = Router();
  const controller = createChildController({ familyChildService });

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  });
  router.use(requireParentAuth(authService, { cookieName: getSessionCookieName(nodeEnv), nodeEnv }));

  router.get('/', controller.list);
  router.post('/', requireSameOrigin(clientOrigin), validateBody(createChildProfileSchema), controller.create);
  router.get('/:childId', validateObjectIdParam('childId'), controller.get);
  router.patch('/:childId', requireSameOrigin(clientOrigin), validateObjectIdParam('childId'), validateBody(updateChildProfileSchema), controller.update);
  router.delete('/:childId', requireSameOrigin(clientOrigin), validateObjectIdParam('childId'), controller.delete);

  return router;
}
