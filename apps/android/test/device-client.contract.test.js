import test from 'node:test';
import assert from 'node:assert/strict';

// Mirror of Android KidsGuardApiClient and ServerConfigStorage contracts
const PAIRING_CODE_REGEX = /^[A-Za-z0-9_-]{22}$/;
const DEVICE_CREDENTIAL_REGEX = /^[A-Za-z0-9_-]{43}$/;

function normalizeApiBaseUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new TypeError('API base URL must be a non-empty string.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new TypeError('Invalid API base URL.');
  }

  if (parsed.username || parsed.password) {
    throw new TypeError('API base URL must not contain credentials.');
  }

  const protocol = parsed.protocol;
  const hostname = parsed.hostname;

  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '10.0.2.2' || hostname === '[::1]';

  if (protocol === 'http:') {
    if (!isLocalhost) {
      throw new TypeError(`Insecure HTTP is not allowed for non-local host '${hostname}'. HTTPS is required.`);
    }
  } else if (protocol !== 'https:') {
    throw new TypeError(`Unsupported protocol '${protocol}'. Only HTTPS (or local HTTP) is permitted.`);
  }

  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/u, '');
}

function validatePairingInput(code, name) {
  if (typeof code !== 'string' || !PAIRING_CODE_REGEX.test(code.trim())) {
    throw new TypeError('Pairing code must be a 22-character base64url string.');
  }
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new TypeError('Device name must be between 1 and 60 characters without control characters.');
  }
}

function validateDeviceCredential(credential) {
  return typeof credential === 'string' && DEVICE_CREDENTIAL_REGEX.test(credential.trim());
}

test('Android contract: normalizeApiBaseUrl permits local HTTP and 10.0.2.2', () => {
  assert.equal(normalizeApiBaseUrl('http://10.0.2.2:5000/api/v1/'), 'http://10.0.2.2:5000/api/v1');
  assert.equal(normalizeApiBaseUrl('http://localhost:5000/api/v1'), 'http://localhost:5000/api/v1');
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:5000/api/v1'), 'http://127.0.0.1:5000/api/v1');
  assert.equal(normalizeApiBaseUrl('https://api.example.com/api/v1/'), 'https://api.example.com/api/v1');
});

test('Android contract: normalizeApiBaseUrl rejects insecure remote HTTP, credentials, and unsupported schemes', () => {
  assert.throws(() => normalizeApiBaseUrl('http://remote.example.com/api/v1'), /Insecure HTTP is not allowed/);
  assert.throws(() => normalizeApiBaseUrl('http://user:pass@10.0.2.2:5000/api/v1'), /credentials/);
  assert.throws(() => normalizeApiBaseUrl('ftp://10.0.2.2:5000/api/v1'), /Unsupported protocol/);
});

test('Android contract: pairing input validation strictly validates 22-char base64url and name bounds', () => {
  assert.doesNotThrow(() => validatePairingInput('aB3-_dE6hI9kLmNoPqRsTu', "Child's Phone"));
  assert.throws(() => validatePairingInput('short', "Child's Phone"), /22-character/);
  assert.throws(() => validatePairingInput('aB3-_dE6hI9kLmNoPqRsTu', ''), /between 1 and 60/);
  assert.throws(() => validatePairingInput('aB3-_dE6hI9kLmNoPqRsTu', 'a'.repeat(61)), /between 1 and 60/);
  assert.throws(() => validatePairingInput('aB3-_dE6hI9kLmNoPqRsTu', 'Bad\u0000Name'), /control characters/);
});

test('Android contract: device credential validation enforces 43-char base64url format', () => {
  assert.equal(validateDeviceCredential('a'.repeat(43)), true);
  assert.equal(validateDeviceCredential('a'.repeat(42)), false);
  assert.equal(validateDeviceCredential('a'.repeat(44)), false);
  assert.equal(validateDeviceCredential('a'.repeat(42) + '+'), false);
  assert.equal(validateDeviceCredential(null), false);
});

test('Android contract: heartbeat request structure and 401 handling specification', () => {
  // Empty body validation
  const emptyBody = JSON.stringify({});
  assert.equal(emptyBody, '{}');

  // Authorization header specification
  const credential = 'a'.repeat(43);
  const authHeader = `Bearer ${credential}`;
  assert.equal(authHeader.startsWith('Bearer '), true);
  assert.equal(authHeader.length, 50);

  // Status transitions
  function handleHeartbeatStatus(statusCode) {
    if (statusCode === 200) return { pairingStatus: 'paired', heartbeatStatus: 'ok' };
    if (statusCode === 401) return { pairingStatus: 'invalid_session', heartbeatStatus: 'invalid_session' };
    if (statusCode === 'network_error') return { pairingStatus: 'paired', heartbeatStatus: 'offline' };
    return { pairingStatus: 'paired', heartbeatStatus: 'error' };
  }

  assert.deepEqual(handleHeartbeatStatus(200), { pairingStatus: 'paired', heartbeatStatus: 'ok' });
  assert.deepEqual(handleHeartbeatStatus(401), { pairingStatus: 'invalid_session', heartbeatStatus: 'invalid_session' });
  assert.deepEqual(handleHeartbeatStatus('network_error'), { pairingStatus: 'paired', heartbeatStatus: 'offline' });
});
