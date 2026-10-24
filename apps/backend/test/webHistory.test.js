import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDevicePairingService } from '../src/services/devicePairingService.js';
import { createFamilyChildService } from '../src/services/familyChildService.js';
import { createPolicyService } from '../src/services/policyService.js';
import { createWebHistoryService } from '../src/services/webHistoryService.js';
import { createMemoryDevicePairingRepository } from '../test-support/memoryDevicePairingRepository.js';
import { createMemoryFamilyChildRepository } from '../test-support/memoryFamilyChildRepository.js';
import { createMemoryPolicyRepository } from '../test-support/memoryPolicyRepository.js';
import { createMemoryWebHistoryRepository } from '../test-support/memoryWebHistoryRepository.js';

const CLIENT_ORIGIN = 'http://localhost:5173';
const PARENT_ONE = { id: '64b000000000000000000001', email: 'parent1@example.com' };
const PARENT_TWO = { id: '64b000000000000000000002', email: 'parent2@example.com' };
const TOKEN_PARENT_ONE = 'a'.repeat(43);
const TOKEN_PARENT_TWO = 'b'.repeat(43);
const cookieFor = (token) => `kidsguard_session=${token}`;

describe('Web History Ingestion and Parent Reporting API', () => {
  let familyChildRepo;
  let devicePairingRepo;
  let webHistoryRepo;
  let devicePairingService;
  let webHistoryService;
  let app;
  let childIdParentOne;
  let childIdParentTwo;
  let deviceCredential;
  let deviceId;

  beforeEach(async () => {
    familyChildRepo = createMemoryFamilyChildRepository();
    devicePairingRepo = createMemoryDevicePairingRepository();
    webHistoryRepo = createMemoryWebHistoryRepository();

    const familyChildService = createFamilyChildService({ repository: familyChildRepo });
    devicePairingService = createDevicePairingService({
      repository: devicePairingRepo,
      familyChildRepository: familyChildRepo,
    });
    const policyService = createPolicyService({
      repository: createMemoryPolicyRepository(),
      familyChildRepository: familyChildRepo,
      devicePairingRepository: devicePairingRepo,
    });
    webHistoryService = createWebHistoryService({
      repository: webHistoryRepo,
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
      webHistoryService,
      runtimeEnv: {
        CLIENT_ORIGIN,
        NODE_ENV: 'test',
        SESSION_SECRET: 'c'.repeat(32),
      },
    });

    const childOne = await familyChildService.createChild(PARENT_ONE.id, { displayName: 'Sammy' });
    childIdParentOne = childOne.id;

    const childTwo = await familyChildService.createChild(PARENT_TWO.id, { displayName: 'Taylor' });
    childIdParentTwo = childTwo.id;

    const pairingCode = await devicePairingService.createPairingCode(
      PARENT_ONE.id,
      childIdParentOne,
      CLIENT_ORIGIN
    );
    const pairedDevice = await devicePairingService.redeemPairingCode({
      code: pairingCode.code,
      name: 'Alex Chromebook',
      platform: 'linux',
    });
    deviceCredential = pairedDevice.deviceCredential;
    deviceId = pairedDevice.device.id;
  });

  it('ingests browsing visits from paired Chrome extension', async () => {
    const visits = [
      {
        url: 'https://en.wikipedia.org/wiki/Space_exploration',
        title: 'Space exploration - Wikipedia',
        domain: 'en.wikipedia.org',
        visitedAt: '2026-10-24T14:30:00.000Z',
        visitCount: 2,
        isBlocked: false,
      },
      {
        url: 'https://khanacademy.org/math/algebra',
        title: 'Algebra 1 | Math | Khan Academy',
        domain: 'khanacademy.org',
        visitedAt: '2026-10-24T14:35:00.000Z',
        visitCount: 1,
        isBlocked: false,
      },
    ];

    const response = await request(app)
      .post('/api/v1/devices/web-history')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({ visits });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.ingestedCount, 2);
  });

  it('allows parent to retrieve child web history with search and domain filters', async () => {
    await request(app)
      .post('/api/v1/devices/web-history')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({
        visits: [
          {
            url: 'https://en.wikipedia.org/wiki/Space_exploration',
            title: 'Space exploration - Wikipedia',
            domain: 'en.wikipedia.org',
            visitedAt: '2026-10-24T14:30:00.000Z',
            visitCount: 2,
            isBlocked: false,
          },
          {
            url: 'https://khanacademy.org/math',
            title: 'Math | Khan Academy',
            domain: 'khanacademy.org',
            visitedAt: '2026-10-24T15:00:00.000Z',
            visitCount: 1,
            isBlocked: false,
          },
          {
            url: 'https://blocked-adult-site.example/video',
            title: 'Adult Content',
            domain: 'blocked-adult-site.example',
            visitedAt: '2026-10-24T15:10:00.000Z',
            visitCount: 1,
            isBlocked: true,
          },
        ],
      });

    // 1. Get all history
    const allRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/web-history`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(allRes.status, 200);
    assert.equal(allRes.body.ok, true);
    assert.equal(allRes.body.data.totalCount, 3);
    assert.equal(allRes.body.data.visits.length, 3);
    // Descending order check
    assert.equal(allRes.body.data.visits[0].domain, 'blocked-adult-site.example');

    // 2. Filter by search query
    const searchRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/web-history?search=khan`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.body.data.totalCount, 1);
    assert.equal(searchRes.body.data.visits[0].domain, 'khanacademy.org');

    // 3. Filter by domain
    const domainRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/web-history?domain=en.wikipedia.org`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(domainRes.status, 200);
    assert.equal(domainRes.body.data.totalCount, 1);
    assert.equal(domainRes.body.data.visits[0].title, 'Space exploration - Wikipedia');
  });

  it('provides web history summary metrics for parent dashboard', async () => {
    await request(app)
      .post('/api/v1/devices/web-history')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({
        visits: [
          { url: 'https://en.wikipedia.org/wiki/Science', title: 'Science', visitedAt: '2026-10-24T10:00:00.000Z', isBlocked: false },
          { url: 'https://en.wikipedia.org/wiki/History', title: 'History', visitedAt: '2026-10-24T11:00:00.000Z', isBlocked: false },
          { url: 'https://khanacademy.org', title: 'Khan Academy', visitedAt: '2026-10-24T12:00:00.000Z', isBlocked: false },
          { url: 'https://badsite.com', title: 'Bad', visitedAt: '2026-10-24T13:00:00.000Z', isBlocked: true },
        ],
      });

    const summaryRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/web-history/summary`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(summaryRes.status, 200);
    assert.equal(summaryRes.body.ok, true);
    assert.equal(summaryRes.body.data.totalVisits, 4);
    assert.equal(summaryRes.body.data.blockedCount, 1);
    assert.equal(summaryRes.body.data.uniqueDomainsCount, 3);
    assert.equal(summaryRes.body.data.topDomains[0].domain, 'en.wikipedia.org');
    assert.equal(summaryRes.body.data.topDomains[0].count, 2);
  });

  it('permanently retains web history even when the extension is uninstalled or revoked', async () => {
    // 1. Ingest visits while paired
    await request(app)
      .post('/api/v1/devices/web-history')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({
        visits: [
          { url: 'https://en.wikipedia.org/wiki/Earth', title: 'Earth', visitedAt: '2026-10-24T10:00:00.000Z' },
          { url: 'https://nationalgeographic.com', title: 'NatGeo', visitedAt: '2026-10-24T10:15:00.000Z' },
        ],
      });

    // 2. Child uninstalls extension
    await devicePairingService.recordDeviceUninstall(deviceId);

    // 3. Parent inspects web history: All browsing history remains permanently available!
    const res = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/web-history`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.totalCount, 2);
    assert.equal(res.body.data.visits.length, 2);

    // 4. Parent revokes device
    await devicePairingService.revokeDevice(PARENT_ONE.id, deviceId, CLIENT_ORIGIN);

    // 5. History is STILL permanently retained!
    const afterRevokeRes = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/web-history`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(afterRevokeRes.status, 200);
    assert.equal(afterRevokeRes.body.data.totalCount, 2);
  });

  it('rejects cross-family queries with 404', async () => {
    const res = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/web-history`)
      .set('Cookie', cookieFor(TOKEN_PARENT_TWO));

    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
  });

  it('rejects unauthenticated and revoked device history uploads with 401', async () => {
    // Missing auth
    const noAuth = await request(app)
      .post('/api/v1/devices/web-history')
      .send({ visits: [{ url: 'https://example.com', visitedAt: '2026-10-24T12:00:00.000Z' }] });
    assert.equal(noAuth.status, 401);

    // Revoke device
    await devicePairingService.revokeDevice(PARENT_ONE.id, deviceId, CLIENT_ORIGIN);

    // Upload with revoked credential
    const revokedAuth = await request(app)
      .post('/api/v1/devices/web-history')
      .set('Authorization', `Bearer ${deviceCredential}`)
      .send({ visits: [{ url: 'https://example.com', visitedAt: '2026-10-24T12:00:00.000Z' }] });
    assert.equal(revokedAuth.status, 401);
  });

  it('fails closed with 503 when web history storage is unavailable', async () => {
    webHistoryRepo.setAvailable(false);

    const res = await request(app)
      .get(`/api/v1/children/${childIdParentOne}/web-history`)
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE));

    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
  });
});
