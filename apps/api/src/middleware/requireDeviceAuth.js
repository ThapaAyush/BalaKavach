import { isValidDeviceCredentialFormat } from '../utils/pairingCredentials.js';

const MAX_AUTH_HEADER_LENGTH = 256;

export function extractBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return null;
  const trimmed = authHeader.trim();
  if (!trimmed || trimmed.length > MAX_AUTH_HEADER_LENGTH) return null;
  const match = trimmed.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i);
  return match ? match[1] : null;
}

export function requireDeviceAuth(devicePairingService) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const credential = extractBearerToken(authHeader);

    if (!credential || !isValidDeviceCredentialFormat(credential)) {
      return res.status(401).json({
        ok: false,
        error: { message: 'Device authentication required.' },
      });
    }

    try {
      const device = await devicePairingService.authenticateDevice(credential);
      if (!device) {
        return res.status(401).json({
          ok: false,
          error: { message: 'Device authentication required.' },
        });
      }

      req.device = device;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
