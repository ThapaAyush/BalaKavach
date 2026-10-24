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

    async recordHeartbeat(req, res, next) {
      try {
        const device = await devicePairingService.recordHeartbeat(req.device.id);
        return res.status(200).json({ ok: true, data: { device } });
      } catch (error) {
        return next(error);
      }
    },

    async recordDeviceUninstall(req, res, next) {
      try {
        const device = await devicePairingService.recordDeviceUninstall(req.params.deviceId);
        if (req.accepts('html') && !req.accepts('json')) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>BalaKavach Protection Notice</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 40px 20px; text-align: center; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    h1 { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 12px; }
    p { font-size: 14px; color: #64748b; line-height: 1.5; margin: 12px 0; }
    .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size: 40px;">🛡️</div>
    <span class="badge">Historical Data Retained</span>
    <h1>Companion Extension Uninstalled</h1>
    <p>The companion app or Chrome extension was uninstalled. All previous screen time activity, domain restrictions, and historical reports for <strong>${device.name}</strong> remain permanently preserved on your parent dashboard.</p>
  </div>
</body>
</html>`);
        }
        return res.status(200).json({
          ok: true,
          data: {
            device,
            message: 'Device marked as uninstalled. All historical activity, screen time records, and policy history remain securely preserved.',
          },
        });
      } catch (error) {
        return next(error);
      }
    },
  });
}
