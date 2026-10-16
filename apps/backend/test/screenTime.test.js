import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDevicePairingService } from '../src/services/devicePairingService.js';
import { createFamilyChildService } from '../src/services/familyChildService.js';
import { createPolicyService } from '../src/services/policyService.js';
import { createScreenTimeService } from '../src/services/screenTimeService.js';
import { ScreenTimeStorageUnavailableError } from '../src/services/screenTimeErrors.js';
import { createMemoryDevicePairingRepository } from '../test-support/memoryDevicePairingRepository.js';
import { createMemoryFamilyChildRepository } from '../test-support/memoryFamilyChildRepository.js';
import { createMemoryPolicyRepository } from '../test-support/memoryPolicyRepository.js';
import { createMemoryScreenTimeRepository } from '../test-support/memoryScreenTimeRepository.js';

const CLIENT_ORIGIN = 'http://localhost:5173';
const PARENT_ONE = { id: '64b000000000000000000001', email: 'parent1@example.com' };
const PARENT_TWO = { id: '64b000000000000000000002', email: 'parent2@example.com' };
const TOKEN_PARENT_ONE = 'a'.repeat(43);
const TOKEN_PARENT_TWO = 'b'.repeat(43);
const cookieFor = (token) => `kidsguard_session=${token}`;

describe('Screen-Time Ingestion and Parent Reporting API', () => {
  let familyChildRepo;
  let devicePairingRepo;
  let policyRepo;
  let screenTimeRepo;
  let devicePairingService;
  let policyService;
  let screenTimeService;
  let app;
  let childIdParentOne;
  let childIdParentTwo;
  let deviceCredential;
  let deviceId;

  beforeEach(async () => {
    familyChildRepo = createMemoryFamilyChildRepository();
    devicePairingRepo = createMemoryDevicePairingRepository();
    policyRepo = createMemoryPolicyRepository();
    screenTimeRepo = createMemoryScreenTimeRepository();

    const familyChildService = createFamilyChildService({ repository: familyChildRepo });
    devicePairingService = createDevicePairingService({
      repository: devicePairingRepo,
      familyChildRepository: familyChildRepo,
    });
    policyService = createPolicyService({
      repository: policyRepo,
      familyChildRepository: familyChildRepo,
      devicePairingRepository: devicePairingRepo,
    });
    screenTimeService = createScreenTimeService({
      repository: screenTimeRepo,
      familyChildRepository: familyChildRepo,
      devicePairingRepository: devicePairingRepo,
      policyRepository: policyRepo,
    });

    const parentsByToken = new Map([
      [TOKEN_PARENT_ONE, PARENT_ONE],
      [TOKEN_PARENT_TWO, PARENT_TWO],
    ]);

    const authService = {
      async register() {},
      async login() {},
      async logout() {},
      async authenticate(token) {
        return parentsByToken.get(token) ?? null;
      },
    };

    app = createApp({
      authService,
      familyChildService,
      devicePairingService,
      policyService,
      screenTimeService,
      runtimeEnv: {
        NODE_ENV: 'test',
        CLIENT_ORIGIN,
      },
    });

    // Create children
    const child1 = await familyChildService.createChild(PARENT_ONE.id, { displayName: 'Alice' });
    childIdParentOne = child1.id;

    const child2 = await familyChildService.createChild(PARENT_TWO.id, { displayName: 'Bob' });
    childIdParentTwo = child2.id;

    // Set a policy with 60 min daily limit for Alice
    await policyService.updatePolicy(PARENT_ONE.id, childIdParentOne, {
      screenTime: { dailyLimitMinutes: 60 },
    });

    // Enroll a device for Alice
    const pairing = await devicePairingService.createPairingCode(PARENT_ONE.id, childIdParentOne);
    const redeemed = await devicePairingService.redeemPairingCode({
      code: pairing.code,
      name: "Alice's Phone",
      platform: 'android',
    });
    deviceCredential = redeemed.deviceCredential;
    deviceId = redeemed.device.id;
  });

  afterEach(() => {
    familyChildRepo.clear();
    policyRepo.clear();
    screenTimeRepo.clear();
  });

  it('ingests measured screen-time summary from paired device with app usage', async () => {
    const payload = {
      date: '2026-10-15',
      totalScreenTimeSeconds: 4500,
      reportingPeriod: {
        start: '2026-10-15T00:00:00.000Z',
        end: '2026-10-15T15:00:00.000Z',
      },
      permissionGranted: true,
      source: 'measured',
      appUsage: [
        { packageName: 'com.duolingo', appName: 'Duolingo', durationSeconds: 2700 },
        { packageName: 'org.wikipedia', appName: 'Wikipedia', durationSeconds: 1800 },
      ],
    };

    const res = await request(app)
      .post('/api/v1/devices/screen-time')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send(payload);

    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.recorded, true);
    assert.equal(res.body.data.date, '2026-10-15');

    // Verify parent can retrieve the record
    const parentRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/screen-time?date=2026-10-15`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(parentRes.status, 200);
    assert.equal(parentRes.body.ok, true);
    const data = parentRes.body.data;
    assert.equal(data.totalScreenTimeSeconds, 4500);
    assert.equal(data.dailyLimitMinutes, 60);
    assert.equal(data.limitExceeded, true); // 4500s (75m) > 60m (3600s)
    assert.equal(data.permissionStatus, 'granted');
    assert.equal(data.source, 'measured');
    assert.equal(data.dataFreshness.isStale, false);
    assert.equal(data.appUsage.length, 2);
    assert.equal(data.appUsage[0].appName, 'Duolingo');
    assert.equal(data.appUsage[0].durationSeconds, 2700);
  });

  it('updates existing daily record on subsequent uploads for the same date', async () => {
    // First upload
    await request(app)
      .post('/api/v1/devices/screen-time')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({
        date: '2026-10-15',
        totalScreenTimeSeconds: 1800,
        reportingPeriod: {
          start: '2026-10-15T00:00:00.000Z',
          end: '2026-10-15T12:00:00.000Z',
        },
        permissionGranted: true,
        source: 'measured',
        appUsage: [{ packageName: 'com.duolingo', appName: 'Duolingo', durationSeconds: 1800 }],
      });

    // Later in the day: updated upload with additional usage
    await request(app)
      .post('/api/v1/devices/screen-time')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({
        date: '2026-10-15',
        totalScreenTimeSeconds: 3000,
        reportingPeriod: {
          start: '2026-10-15T00:00:00.000Z',
          end: '2026-10-15T16:00:00.000Z',
        },
        permissionGranted: true,
        source: 'measured',
        appUsage: [
          { packageName: 'com.duolingo', appName: 'Duolingo', durationSeconds: 2400 },
          { packageName: 'org.wikipedia', appName: 'Wikipedia', durationSeconds: 600 },
        ],
      });

    // Parent sees the updated total and latest apps
    const parentRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/screen-time?date=2026-10-15`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(parentRes.status, 200);
    assert.equal(parentRes.body.data.totalScreenTimeSeconds, 3000);
    assert.equal(parentRes.body.data.appUsage.length, 2);
    assert.equal(parentRes.body.data.appUsage[0].durationSeconds, 2400);
  });

  it('strictly handles permission_denied: requires totalScreenTimeSeconds to be null without fabricating values', async () => {
    // Valid permission denied payload: totalScreenTimeSeconds is null
    const res = await request(app)
      .post('/api/v1/devices/screen-time')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({
        date: '2026-10-15',
        totalScreenTimeSeconds: null,
        reportingPeriod: {
          start: '2026-10-15T00:00:00.000Z',
          end: '2026-10-15T10:00:00.000Z',
        },
        permissionGranted: false,
        source: 'unavailable',
        appUsage: [],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);

    // Parent view reflects permission denied and null usage
    const parentRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/screen-time?date=2026-10-15`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(parentRes.status, 200);
    assert.equal(parentRes.body.data.totalScreenTimeSeconds, null);
    assert.equal(parentRes.body.data.permissionStatus, 'denied');
    assert.equal(parentRes.body.data.source, 'unavailable');
    assert.equal(parentRes.body.data.limitExceeded, false);

    // Rejects fabricated non-null duration when permission is false
    const invalidRes = await request(app)
      .post('/api/v1/devices/screen-time')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({
        date: '2026-10-15',
        totalScreenTimeSeconds: 1200, // Non-null when permissionGranted is false -> REJECT
        reportingPeriod: {
          start: '2026-10-15T00:00:00.000Z',
          end: '2026-10-15T10:00:00.000Z',
        },
        permissionGranted: false,
      });

    assert.equal(invalidRes.status, 400);
    assert.equal(invalidRes.body.ok, false);
  });

  it('rejects cross-family screen-time queries with 404', async () => {
    // Parent Two tries to view Parent One's child's screen time
    const res = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/screen-time?date=2026-10-15`)
      .set('Cookie', cookieFor(TOKEN_PARENT_TWO));

    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
  });

  it('rejects unauthenticated and revoked device screen-time uploads with 401', async () => {
    // Unauthenticated
    const unauthRes = await request(app)
      .post('/api/v1/devices/screen-time')
      .send({
        date: '2026-10-15',
        totalScreenTimeSeconds: 100,
        reportingPeriod: {
          start: '2026-10-15T00:00:00.000Z',
          end: '2026-10-15T01:00:00.000Z',
        },
        permissionGranted: true,
      });
    assert.equal(unauthRes.status, 401);

    // Revoke device
    await devicePairingService.revokeDevice(PARENT_ONE.id, deviceId);

    // Revoked device upload rejected
    const revokedRes = await request(app)
      .post('/api/v1/devices/screen-time')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({
        date: '2026-10-15',
        totalScreenTimeSeconds: 100,
        reportingPeriod: {
          start: '2026-10-15T00:00:00.000Z',
          end: '2026-10-15T01:00:00.000Z',
        },
        permissionGranted: true,
      });
    assert.equal(revokedRes.status, 401);
  });

  it('fails closed with 503 when screen-time storage is unavailable', async () => {
    const unavailableService = createScreenTimeService({
      repository: {
        assertAvailable() { throw new ScreenTimeStorageUnavailableError(); },
        async recordScreenTime() { throw new ScreenTimeStorageUnavailableError(); },
        async findSummariesByChildAndDate() { throw new ScreenTimeStorageUnavailableError(); },
        async findRecentSummariesByChild() { throw new ScreenTimeStorageUnavailableError(); },
      },
      familyChildRepository: familyChildRepo,
      devicePairingRepository: devicePairingRepo,
      policyRepository: policyRepo,
    });

    const unavailableApp = createApp({
      authService: { async authenticate() { return PARENT_ONE; } },
      familyChildService: createFamilyChildService({ repository: familyChildRepo }),
      devicePairingService,
      screenTimeService: unavailableService,
      runtimeEnv: { NODE_ENV: 'test', CLIENT_ORIGIN },
    });

    const res = await request(unavailableApp)
      .get(`/api/v1/children/${childIdParentOne}/screen-time`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error.message, /temporarily unavailable/i);
  });
});
