export function createPolicyController({ policyService }) {
  return Object.freeze({
    async get(req, res, next) {
      try {
        const policy = await policyService.getPolicy(req.parent.id, req.params.childId);
        return res.status(200).json({ ok: true, data: { policy } });
      } catch (error) {
        return next(error);
      }
    },

    async update(req, res, next) {
      try {
        const policy = await policyService.updatePolicy(req.parent.id, req.params.childId, req.validatedBody);
        return res.status(200).json({ ok: true, data: { policy } });
      } catch (error) {
        return next(error);
      }
    },

    async getDevicePolicy(req, res, next) {
      try {
        const result = await policyService.getDevicePolicy(req.device);
        return res.status(200).json({ ok: true, data: result });
      } catch (error) {
        return next(error);
      }
    },

    async acknowledgeDevicePolicy(req, res, next) {
      try {
        const result = await policyService.acknowledgeDevicePolicy(
          req.device,
          req.validatedBody.acknowledgedVersion,
        );
        return res.status(200).json({ ok: true, data: result });
      } catch (error) {
        return next(error);
      }
    },
  });
}
