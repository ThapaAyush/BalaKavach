import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  DevicePairingStorageUnavailableError,
} from '../src/services/devicePairingErrors.js';
import { createDevicePairingService } from '../src/services/devicePairingService.js';
import { createFamilyChildService } from '../src/services/familyChildService.js';
import { generateDeviceCredential } from '../src/utils/pairingCredentials.js';
import { createMemoryDevicePairingRepository } from '../test-support/memoryDevicePairingRepository.js';
import { createMemoryFamilyChildRepository } from '../test-support/memoryFamilyChildRepository.js';
import { deviceHeartbeatSchema } from '../src/validators/devicePairingValidators.js';

const CLIENT_ORIGIN = 'http://localhost:5173';
const PARENT_ONE = { id: '64b000000000000000000001', email: 'one@example.com' };
const TOKEN_PARENT_ONE = 'a'.repeat(43);
const cookieFor = (token) => `kidsguard_session=${token}`;

describe('POST /api/v1/devices/heartbeat', () => {
  let repository;
  let familyChildRepository;
  let devicePairingService;
  let currentTime;
  let app;
  let childId;
  let enrolledDevice;
  let deviceCredential;

  beforeEach(async () => {
    repository = createMemoryDevicePairingRepository();
    familyChildRepository = createMemoryFamilyChildRepository();
    currentTime = new Date('2026-10-14T10:00:00.000Z');

    devicePairingService = createDevicePairingService({
      repository,
      familyChildRepository,
      now: () => new Date(currentTime),
    });

    const authService = {
      async register() {},
      async login() {},
      async logout() {},
      async authenticate(token) {
        return token === TOKEN_PARENT_ONE ? PARENT_ONE : null;
      },
    };

    app = createApp({
      authService,
      familyChildService: createFamilyChildService({ repository: familyChildRepository }),
      devicePairingService,
      runtimeEnv: {
        NODE_ENV: 'test',
        CLIENT_ORIGIN,
        rateLimitConfig: {
          heartbeat: { limit: 5, windowMs: 60 * 1000 },
        },
      },
    });

    // Create child and enroll a test device
    const family = await familyChildRepository.getOrCreateFamilyForParent(PARENT_ONE.id);
    const child = await familyChildRepository.createChildProfile({
      familyId: family._id,
      displayName: 'Alex',
    });
    childId = child._id;

    const { code } = await devicePairingService.createPairingCode(PARENT_ONE.id, childId);
    const enrollment = await devicePairingService.redeemPairingCode({
      code,
      name: 'Kitchen Tablet',
      platform: 'android',
    });
    enrolledDevice = enrollment.device;
    deviceCredential = enrollment.deviceCredential;
  });

  afterEach(() => {
    repository.clear();
    familyChildRepository.clear();
  });

  it('updates lastSeenAt and returns sanitized device details with no-store headers', async () => {
    assert.equal(enrolledDevice.lastSeenAt, null);

    currentTime = new Date('2026-10-14T10:05:00.000Z');

    const res = await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(200);

    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.device.id, enrolledDevice.id);
    assert.equal(res.body.data.device.name, 'Kitchen Tablet');
    assert.equal(res.body.data.device.platform, 'android');
    assert.equal(res.body.data.device.pairingStatus, 'paired');
    assert.equal(res.body.data.device.enforcementStatus, 'not_implemented');
    assert.equal(res.body.data.device.lastSeenAt, '2026-10-14T10:05:00.000Z');
    assert.equal(res.body.data.device.revokedAt, null);
    assert.equal('credentialHash' in res.body.data.device, false);
    assert.equal('deviceCredential' in res.body.data, false);

    // Verify stored record
    const stored = repository.getDeviceById(enrolledDevice.id);
    assert.equal(stored.lastSeenAt.toISOString(), '2026-10-14T10:05:00.000Z');

    // Subsequent heartbeat updates lastSeenAt again
    currentTime = new Date('2026-10-14T10:10:00.000Z');
    const res2 = await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(200);

    assert.equal(res2.body.data.device.lastSeenAt, '2026-10-14T10:10:00.000Z');
  });

  it('rejects missing, invalid, or malformed credentials with 401', async () => {
    const missingRes = await request(app)
      .post('/api/v1/devices/heartbeat')
      .expect(401);
    assert.equal(missingRes.body.ok, false);
    assert.equal(missingRes.body.error.message, 'Device authentication required.');

    const malformedRes = await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    assert.equal(malformedRes.body.ok, false);

    const unknownRes = await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${generateDeviceCredential()}`)
      .expect(401);
    assert.equal(unknownRes.body.ok, false);
  });

  it('rejects heartbeats from already-revoked devices and preserves lastSeenAt', async () => {
    // Record initial heartbeat
    currentTime = new Date('2026-10-14T10:01:00.000Z');
    await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(200);

    // Parent revokes the device
    currentTime = new Date('2026-10-14T10:02:00.000Z');
    await request(app)
      .delete(`/api/v1/devices/${enrolledDevice.id}`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .set('Origin', CLIENT_ORIGIN)
      .expect(204);

    // Heartbeat after revocation must fail
    currentTime = new Date('2026-10-14T10:03:00.000Z');
    const res = await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(401);

    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.message, 'Device authentication required.');

    // Verify lastSeenAt was NOT modified after revocation
    const stored = repository.getDeviceById(enrolledDevice.id);
    assert.equal(stored.lastSeenAt.toISOString(), '2026-10-14T10:01:00.000Z');
    assert.equal(stored.revokedAt.toISOString(), '2026-10-14T10:02:00.000Z');
  });

  it('heartbeat update is conditional and fails if revocation races between auth and update', async () => {
    // Simulate a race: device authenticates, but recordHeartbeat detects revocation occurred concurrently
    const raceRepo = {
      assertAvailable() {},
      async findDeviceByCredentialHash(hash) {
        // Device appears active at authentication time
        return repository.findDeviceByCredentialHash(hash);
      },
      async recordHeartbeat() {
        // At conditional update time, device was revoked concurrently: returns null
        return null;
      },
    };

    const raceService = createDevicePairingService({
      repository: raceRepo,
      familyChildRepository,
      now: () => new Date(currentTime),
    });

    const raceApp = createApp({
      authService: {
        async register() {},
        async login() {},
        async logout() {},
        async authenticate() {},
      },
      familyChildService: createFamilyChildService({ repository: familyChildRepository }),
      devicePairingService: raceService,
      runtimeEnv: {
        NODE_ENV: 'test',
        CLIENT_ORIGIN,
      },
    });

    const res = await request(raceApp)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(401);

    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.message, 'Device authentication required.');
  });

  it('rejects unexpected body fields with 400', async () => {
    const res = await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({ enforcementStatus: 'active', hacked: true })
      .expect(400);

    assert.equal(res.body.ok, false);
  });

  it('deviceHeartbeatSchema accepts empty or omitted body and rejects extra fields', () => {
    assert.deepEqual(deviceHeartbeatSchema.parse(undefined), undefined);
    assert.deepEqual(deviceHeartbeatSchema.parse({}), {});
    assert.throws(() => deviceHeartbeatSchema.parse({ extra: 'field' }));
    assert.throws(() => deviceHeartbeatSchema.parse('string-not-object'));
  });

  it('enforces rate limiting on repeated heartbeats', async () => {
    // Configured limit is 5 requests per 60s
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/devices/heartbeat')
        .set('Authorization', `Bearer ${deviceCredential}`)
        .expect(200);
    }

    // 6th request must be rate limited
    const limitedRes = await request(app)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(429);

    assert.equal(limitedRes.body.ok, false);
    assert.equal(limitedRes.body.error.message, 'Too many heartbeat requests. Try again later.');
  });

  it('fails closed with 503 when device storage is unavailable during heartbeat', async () => {
    const failingRepo = {
      assertAvailable() {
        throw new DevicePairingStorageUnavailableError();
      },
      async findDeviceByCredentialHash() {
        throw new DevicePairingStorageUnavailableError();
      },
      async recordHeartbeat() {
        throw new DevicePairingStorageUnavailableError();
      },
    };

    const failingService = createDevicePairingService({
      repository: failingRepo,
      familyChildRepository,
    });

    const failingApp = createApp({
      authService: {
        async register() {},
        async login() {},
        async logout() {},
        async authenticate() {},
      },
      familyChildService: createFamilyChildService({ repository: familyChildRepository }),
      devicePairingService: failingService,
      runtimeEnv: {
        NODE_ENV: 'test',
        CLIENT_ORIGIN,
      },
    });

    const res = await request(failingApp)
      .post('/api/v1/devices/heartbeat')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .expect(503);

    assert.equal(res.body.ok, false);
    assert.match(res.body.error.message, /unavailable/i);
  });
});
