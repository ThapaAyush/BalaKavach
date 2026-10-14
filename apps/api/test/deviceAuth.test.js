import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { extractBearerToken, requireDeviceAuth } from '../src/middleware/requireDeviceAuth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { DevicePairingStorageUnavailableError } from '../src/services/devicePairingErrors.js';
import { createDevicePairingService } from '../src/services/devicePairingService.js';
import {
  generateDeviceCredential,
  generatePairingCode,
  hashSecret,
  isValidDeviceCredentialFormat,
} from '../src/utils/pairingCredentials.js';
import { createMemoryDevicePairingRepository } from '../test-support/memoryDevicePairingRepository.js';
import { createMemoryFamilyChildRepository } from '../test-support/memoryFamilyChildRepository.js';

describe('device credential format validation', () => {
  it('accepts valid 43-character base64url credentials', () => {
    const cred = generateDeviceCredential();
    assert.equal(cred.length, 43);
    assert.equal(isValidDeviceCredentialFormat(cred), true);
  });

  it('rejects invalid types, wrong lengths, and non-base64url characters', () => {
    assert.equal(isValidDeviceCredentialFormat(''), false);
    assert.equal(isValidDeviceCredentialFormat(null), false);
    assert.equal(isValidDeviceCredentialFormat(undefined), false);
    assert.equal(isValidDeviceCredentialFormat(12345), false);
    assert.equal(isValidDeviceCredentialFormat('a'.repeat(42)), false);
    assert.equal(isValidDeviceCredentialFormat('a'.repeat(44)), false);
    assert.equal(isValidDeviceCredentialFormat(`${'a'.repeat(42)}+`), false);
    assert.equal(isValidDeviceCredentialFormat(`${'a'.repeat(42)}/`), false);
    assert.equal(isValidDeviceCredentialFormat(`${'a'.repeat(42)}=`), false);
    assert.equal(isValidDeviceCredentialFormat(`${'a'.repeat(42)} `), false);
  });
});

describe('extractBearerToken', () => {
  it('extracts token from Bearer authorization header with single or multiple spaces and trims outer whitespace', () => {
    assert.equal(extractBearerToken('Bearer myToken'), 'myToken');
    assert.equal(extractBearerToken('bearer myToken'), 'myToken');
    assert.equal(extractBearerToken('BEARER   myToken'), 'myToken');
    assert.equal(extractBearerToken('   Bearer myToken   '), 'myToken');
  });

  it('returns null for non-Bearer, malformed, oversized, or ambiguous headers', () => {
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken(null), null);
    assert.equal(extractBearerToken(''), null);
    assert.equal(extractBearerToken('Basic dXNlcjpwYXNz'), null);
    assert.equal(extractBearerToken('Bearer'), null);
    assert.equal(extractBearerToken('Bearer token with spaces'), null);
    assert.equal(extractBearerToken('Bearer "myToken"'), null);
    assert.equal(extractBearerToken('Bearer token1, Bearer token2'), null);
    assert.equal(extractBearerToken(`Bearer ${'a'.repeat(300)}`), null);
  });
});

describe('device authentication service & middleware', () => {
  const PARENT_ID = '64b000000000000000000001';
  let repository;
  let familyChildRepository;
  let devicePairingService;
  let childId;
  let app;

  beforeEach(async () => {
    repository = createMemoryDevicePairingRepository();
    familyChildRepository = createMemoryFamilyChildRepository();
    devicePairingService = createDevicePairingService({
      repository,
      familyChildRepository,
      now: () => new Date('2026-10-14T00:00:00.000Z'),
    });

    const family = await familyChildRepository.getOrCreateFamilyForParent(PARENT_ID);
    const child = await familyChildRepository.createChildProfile({
      familyId: family._id,
      displayName: 'Alex',
    });
    childId = child._id;

    app = express();
    app.use(express.json());
    app.get('/api/v1/test/device-auth', requireDeviceAuth(devicePairingService), (req, res) => {
      res.status(200).json({ ok: true, data: { device: req.device } });
    });
    app.use(errorHandler);
  });

  afterEach(() => {
    repository.clear();
    familyChildRepository.clear();
  });

  async function enrollTestDevice(name = 'Test Tablet') {
    const { code } = await devicePairingService.createPairingCode(PARENT_ID, childId);
    return devicePairingService.redeemPairingCode({
      code,
      name,
      platform: 'android',
    });
  }

  it('authenticates a valid enrolled device and omits credential hashes', async () => {
    const { device, deviceCredential } = await enrollTestDevice();

    const authenticated = await devicePairingService.authenticateDevice(deviceCredential);
    assert.ok(authenticated);
    assert.equal(authenticated.id, device.id);
    assert.equal(authenticated.name, 'Test Tablet');
    assert.equal(authenticated.platform, 'android');
    assert.equal(authenticated.pairingStatus, 'paired');
    assert.equal(authenticated.enforcementStatus, 'not_implemented');
    assert.equal(authenticated.revokedAt, null);
    assert.equal('credentialHash' in authenticated, false);

    const res = await request(app)
      .get('/api/v1/test/device-auth')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.device.id, device.id);
    assert.equal('credentialHash' in res.body.data.device, false);
  });

  it('rejects unknown credentials with 401', async () => {
    const fakeCredential = generateDeviceCredential();

    const authenticated = await devicePairingService.authenticateDevice(fakeCredential);
    assert.equal(authenticated, null);

    const res = await request(app)
      .get('/api/v1/test/device-auth')
      .set('Authorization', `Bearer ${fakeCredential}`)
      .expect(401);

    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.message, 'Device authentication required.');
  });

  it('rejects malformed credentials without querying storage', async () => {
    const authenticated = await devicePairingService.authenticateDevice('invalid-credential');
    assert.equal(authenticated, null);

    const res = await request(app)
      .get('/api/v1/test/device-auth')
      .set('Authorization', 'Bearer invalid-length')
      .expect(401);

    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.message, 'Device authentication required.');
  });

  it('rejects requests with missing or non-Bearer authorization header with 401', async () => {
    const noHeaderRes = await request(app)
      .get('/api/v1/test/device-auth')
      .expect(401);
    assert.equal(noHeaderRes.body.ok, false);
    assert.equal(noHeaderRes.body.error.message, 'Device authentication required.');

    const basicRes = await request(app)
      .get('/api/v1/test/device-auth')
      .set('Authorization', 'Basic 12345')
      .expect(401);
    assert.equal(basicRes.body.ok, false);
  });

  it('rejects credentials for a revoked device', async () => {
    const { device, deviceCredential } = await enrollTestDevice();

    // Parent revokes device
    await devicePairingService.revokeDevice(PARENT_ID, device.id);

    const authenticated = await devicePairingService.authenticateDevice(deviceCredential);
    assert.equal(authenticated, null);

    const res = await request(app)
      .get('/api/v1/test/device-auth')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(401);

    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.message, 'Device authentication required.');
  });

  it('fails closed when device storage is unavailable', async () => {
    const failingRepo = {
      assertAvailable() {
        throw new DevicePairingStorageUnavailableError();
      },
      async findDeviceByCredentialHash() {
        throw new DevicePairingStorageUnavailableError();
      },
    };
    const failingService = createDevicePairingService({
      repository: failingRepo,
      familyChildRepository,
    });

    const failingApp = express();
    failingApp.get('/api/v1/test/device-auth', requireDeviceAuth(failingService), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    failingApp.use(errorHandler);

    const cred = generateDeviceCredential();
    const res = await request(failingApp)
      .get('/api/v1/test/device-auth')
      .set('Authorization', `Bearer ${cred}`)
      .expect(503);

    assert.equal(res.body.ok, false);
    assert.match(res.body.error.message, /unavailable/i);
  });

  it('rejects oversized authorization headers and ambiguous bearer formats with 401', async () => {
    const oversized = await request(app)
      .get('/api/v1/test/device-auth')
      .set('Authorization', `Bearer ${'a'.repeat(300)}`)
      .expect(401);
    assert.equal(oversized.body.ok, false);

    const multiple = await request(app)
      .get('/api/v1/test/device-auth')
      .set('Authorization', 'Bearer token1, Bearer token2')
      .expect(401);
    assert.equal(multiple.body.ok, false);

    const quoted = await request(app)
      .get('/api/v1/test/device-auth')
      .set('Authorization', 'Bearer "token"')
      .expect(401);
    assert.equal(quoted.body.ok, false);
  });

  it('repository findDeviceByCredentialHash rejects non-hex and malformed hashes', async () => {
    assert.equal(await repository.findDeviceByCredentialHash('not-a-valid-hex-hash'), null);
    assert.equal(await repository.findDeviceByCredentialHash(''), null);
    assert.equal(await repository.findDeviceByCredentialHash(null), null);
    assert.equal(await repository.findDeviceByCredentialHash('a'.repeat(63)), null);
    assert.equal(await repository.findDeviceByCredentialHash('a'.repeat(65)), null);
  });
});
