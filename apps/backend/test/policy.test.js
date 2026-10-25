import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDevicePairingService } from '../src/services/devicePairingService.js';
import { createFamilyChildService } from '../src/services/familyChildService.js';
import { createPolicyService } from '../src/services/policyService.js';
import { PolicyStorageUnavailableError } from '../src/services/policyErrors.js';
import { createMemoryDevicePairingRepository } from '../test-support/memoryDevicePairingRepository.js';
import { createMemoryFamilyChildRepository } from '../test-support/memoryFamilyChildRepository.js';
import { createMemoryPolicyRepository } from '../test-support/memoryPolicyRepository.js';

const CLIENT_ORIGIN = 'http://localhost:5173';
const PARENT_ONE = { id: '64b000000000000000000001', email: 'parent1@example.com' };
const PARENT_TWO = { id: '64b000000000000000000002', email: 'parent2@example.com' };
const TOKEN_PARENT_ONE = 'a'.repeat(43);
const TOKEN_PARENT_TWO = 'b'.repeat(43);
const cookieFor = (token) => `kidsguard_session=${token}`;

describe('Policy Management API (/api/v1/children/:childId/policy & /api/v1/devices/policy*)', () => {
  let familyChildRepo;
  let devicePairingRepo;
  let policyRepo;
  let devicePairingService;
  let policyService;
  let app;
  let childIdParentOne;
  let childIdParentTwo;
  let deviceCredential;
  let deviceId;

  beforeEach(async () => {
    familyChildRepo = createMemoryFamilyChildRepository();
    devicePairingRepo = createMemoryDevicePairingRepository();
    policyRepo = createMemoryPolicyRepository();

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
      runtimeEnv: {
        NODE_ENV: 'test',
        CLIENT_ORIGIN,
      },
    });

    // Create children for Parent One and Parent Two
    const child1 = await familyChildService.createChild(PARENT_ONE.id, { displayName: 'Alice' });
    childIdParentOne = child1.id;

    const child2 = await familyChildService.createChild(PARENT_TWO.id, { displayName: 'Bob' });
    childIdParentTwo = child2.id;

    // Enroll a device for Alice
    const pairing = await devicePairingService.createPairingCode(PARENT_ONE.id, childIdParentOne);
    const redeemed = await devicePairingService.redeemPairingCode({
      code: pairing.code,
      name: "Alice's Tablet",
      platform: 'android',
    });
    deviceCredential = redeemed.deviceCredential;
    deviceId = redeemed.device.id;
  });

  afterEach(() => {
    familyChildRepo.clear();
    policyRepo.clear();
  });

  it('returns default policy when none has been saved yet', async () => {
    const res = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.policy.version, 1);
    assert.equal(res.body.data.policy.screenTime.dailyLimitMinutes, null);
    assert.equal(res.body.data.policy.screenTime.quietHours.enabled, false);
    assert.equal(res.body.data.policy.webRestrictions.enabled, false);
    assert.deepEqual(res.body.data.policy.webRestrictions.blockedDomains, []);
  });

  it('saves and increments policy version on parent updates with normalization', async () => {
    const updatePayload = {
      screenTime: {
        dailyLimitMinutes: 120,
        quietHours: {
          enabled: true,
          start: '21:30',
          end: '06:30',
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'sunday'],
        },
      },
      webRestrictions: {
        enabled: true,
        blockAdultContent: true,
        blockedDomains: ['EXAMPLE.COM', 'https://badsite.org/', 'sub.domain.co.uk.', 'www.youtube.com', 'https://m.youtube.com/'],
      },
    };

    const res = await request(app)
      .put(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .set('Origin', CLIENT_ORIGIN)
      .send(updatePayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    const policy = res.body.data.policy;
    assert.equal(policy.version, 1);
    assert.equal(policy.screenTime.dailyLimitMinutes, 120);
    assert.equal(policy.screenTime.quietHours.enabled, true);
    assert.equal(policy.screenTime.quietHours.start, '21:30');
    assert.equal(policy.screenTime.quietHours.end, '06:30');
    assert.equal(policy.webRestrictions.enabled, true);
    assert.equal(policy.webRestrictions.blockAdultContent, true);
    // Verified domain normalization
    assert.deepEqual(policy.webRestrictions.blockedDomains, [
      'example.com',
      'badsite.org',
      'sub.domain.co.uk',
      'youtube.com',
      'm.youtube.com',
    ]);

    // Second update increments version to 2
    const res2 = await request(app)
      .put(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .set('Origin', CLIENT_ORIGIN)
      .send({
        screenTime: { dailyLimitMinutes: 90 },
      });

    assert.equal(res2.status, 200);
    assert.equal(res2.body.data.policy.version, 2);
    assert.equal(res2.body.data.policy.screenTime.dailyLimitMinutes, 90);
    // Preserves previously configured quiet hours and web restrictions
    assert.equal(res2.body.data.policy.screenTime.quietHours.start, '21:30');
    assert.deepEqual(res2.body.data.policy.webRestrictions.blockedDomains, [
      'example.com',
      'badsite.org',
      'sub.domain.co.uk',
      'youtube.com',
      'm.youtube.com',
    ]);
  });

  it('rejects cross-family policy read and write attempts with 404', async () => {
    // Parent Two tries to read Parent One's child's policy
    const readRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_TWO));
    assert.equal(readRes.status, 404);
    assert.equal(readRes.body.ok, false);

    // Parent Two tries to update Parent One's child's policy
    const updateRes = await request(app)
      .put(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_TWO))
      .set('Origin', CLIENT_ORIGIN)
      .send({ screenTime: { dailyLimitMinutes: 60 } });
    assert.equal(updateRes.status, 404);
    assert.equal(updateRes.body.ok, false);
  });

  it('rejects invalid inputs: invalid time format, invalid domains, untrusted origin', async () => {
    // Missing origin
    const originRes = await request(app)
      .put(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .send({ screenTime: { dailyLimitMinutes: 60 } });
    assert.equal(originRes.status, 403);

    // Invalid time
    const timeRes = await request(app)
      .put(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .set('Origin', CLIENT_ORIGIN)
      .send({ screenTime: { quietHours: { start: '25:99' } } });
    assert.equal(timeRes.status, 400);

    // Invalid domain (IP address or numeric TLD)
    const domainRes = await request(app)
      .put(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .set('Origin', CLIENT_ORIGIN)
      .send({ webRestrictions: { blockedDomains: ['192.168.1.1'] } });
    assert.equal(domainRes.status, 400);
  });

  it('allows authenticated paired device to fetch and acknowledge current policy', async () => {
    // Parent updates policy (first save -> version 1)
    await request(app)
      .put(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .set('Origin', CLIENT_ORIGIN)
      .send({
        screenTime: { dailyLimitMinutes: 180 },
        webRestrictions: { enabled: true, blockedDomains: ['gamingsite.com'] },
      });

    // Device fetches policy
    const fetchRes = await request(app)
      .get('/api/v1/devices/policy')
      .set('Authorization', `Bearer ${deviceCredential}`);

    assert.equal(fetchRes.status, 200);
    assert.equal(fetchRes.body.ok, true);
    assert.equal(fetchRes.body.data.policyVersion, 1);
    assert.equal(fetchRes.body.data.policy.screenTime.dailyLimitMinutes, 180);
    assert.deepEqual(fetchRes.body.data.policy.webRestrictions.blockedDomains, ['gamingsite.com']);

    // Device acknowledges policy
    const ackRes = await request(app)
      .post('/api/v1/devices/policy/ack')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({ acknowledgedVersion: 1 });

    assert.equal(ackRes.status, 200);
    assert.equal(ackRes.body.ok, true);
    assert.equal(ackRes.body.data.acknowledgedVersion, 1);
    assert.ok(ackRes.body.data.syncedAt);

    // Verify parent device list reflects acknowledgedPolicyVersion and sync timestamp
    const devListRes = await request(app)
      .get('/api/v1/devices')
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));
    assert.equal(devListRes.status, 200);
    const listedDevice = devListRes.body.data.devices.find((d) => d.id === deviceId);
    assert.equal(listedDevice.acknowledgedPolicyVersion, 1);
    assert.ok(listedDevice.lastPolicyAckAt);
  });

  it('rejects device policy requests after parent revokes device', async () => {
    // Parent revokes device
    await devicePairingService.revokeDevice(PARENT_ONE.id, deviceId);

    // Device policy fetch is rejected with 401
    const fetchRes = await request(app)
      .get('/api/v1/devices/policy')
      .set('Authorization', `Bearer ${deviceCredential}`);
    assert.equal(fetchRes.status, 401);

    // Device ack is rejected with 401
    const ackRes = await request(app)
      .post('/api/v1/devices/policy/ack')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({ acknowledgedVersion: 1 });
    assert.equal(ackRes.status, 401);
  });

  it('supports appRestrictions for mobile companion apps without VPN', async () => {
    const updateRes = await request(app)
      .put(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .set('Origin', CLIENT_ORIGIN)
      .send({
        appRestrictions: {
          enabled: true,
          blockedApps: [
            { packageName: 'com.zhiliaoapp.musically', appName: 'TikTok' },
            { packageName: 'com.roblox.client', appName: 'Roblox' },
            'com.google.android.youtube',
          ],
        },
      });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.policy.appRestrictions.enabled, true);
    assert.equal(updateRes.body.data.policy.appRestrictions.blockedApps.length, 3);
    assert.deepEqual(updateRes.body.data.policy.appRestrictions.blockedApps[0], {
      packageName: 'com.zhiliaoapp.musically',
      appName: 'TikTok',
    });
    assert.deepEqual(updateRes.body.data.policy.appRestrictions.blockedApps[2], {
      packageName: 'com.google.android.youtube',
      appName: 'com.google.android.youtube',
    });

    // Device fetches policy with appRestrictions
    const deviceRes = await request(app)
      .get('/api/v1/devices/policy')
      .set('Authorization', `Bearer ${deviceCredential}`);

    assert.equal(deviceRes.status, 200);
    assert.equal(deviceRes.body.data.policy.appRestrictions.enabled, true);
    assert.equal(deviceRes.body.data.policy.appRestrictions.blockedApps.length, 3);
  });

  it('fails closed with 503 when policy storage is unavailable', async () => {
    const unavailableService = createPolicyService({
      repository: {
        assertAvailable() { throw new PolicyStorageUnavailableError(); },
        async findPolicyByChildId() { throw new PolicyStorageUnavailableError(); },
        async savePolicy() { throw new PolicyStorageUnavailableError(); },
      },
      familyChildRepository: familyChildRepo,
      devicePairingRepository: devicePairingRepo,
    });

    const unavailableApp = createApp({
      authService: { async authenticate() { return PARENT_ONE; } },
      familyChildService: createFamilyChildService({ repository: familyChildRepo }),
      devicePairingService,
      policyService: unavailableService,
      runtimeEnv: { NODE_ENV: 'test', CLIENT_ORIGIN },
    });

    const res = await request(unavailableApp)
      .get(`/api/v1/children/${childIdParentOne}/policy`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    assert.match(res.body.error.message, /temporarily unavailable/i);
  });
});
