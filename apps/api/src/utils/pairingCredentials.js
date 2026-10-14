import { createHash, randomBytes } from 'node:crypto';

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

export function generatePairingCode() {
  return randomBytes(16).toString('base64url');
}

export function generateDeviceCredential() {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const DEVICE_CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidDeviceCredentialFormat(value) {
  return typeof value === 'string' && DEVICE_CREDENTIAL_PATTERN.test(value);
}
