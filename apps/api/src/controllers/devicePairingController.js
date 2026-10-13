export function createDevicePairingController({ devicePairingService }) {
  return Object.freeze({
    async createPairingCode(req, res, next) {
      try {
        const pairingCode = await devicePairingService.createPairingCode(req.parent.id, req.params.childId);
        return res.status(201).json({ ok: true, data: { pairingCode } });
      } catch (error) {
        return next(error);
      }
    },

    async revokePairingCode(req, res, next) {
      try {
        await devicePairingService.revokePairingCode(
          req.parent.id,
          req.params.childId,
          req.params.pairingCodeId,
        );
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    },

    async redeemPairingCode(req, res, next) {
      try {
        const result = await devicePairingService.redeemPairingCode(req.validatedBody);
        return res.status(201).json({ ok: true, data: result });
      } catch (error) {
        return next(error);
      }
    },

    async listDevices(req, res, next) {
      try {
        const devices = await devicePairingService.listDevices(req.parent.id);
        return res.status(200).json({ ok: true, data: { devices } });
      } catch (error) {
        return next(error);
      }
    },

    async revokeDevice(req, res, next) {
      try {
        await devicePairingService.revokeDevice(req.parent.id, req.params.deviceId);
        return res.status(204).end();
      } catch (error) {
        return next(error);
      }
    },
  });
}
