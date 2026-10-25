import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../backend/src/app.js';
import { createDevicePairingService } from '../../backend/src/services/devicePairingService.js';
import { createFamilyChildService } from '../../backend/src/services/familyChildService.js';
import { createPolicyService } from '../../backend/src/services/policyService.js';
import { createMemoryDevicePairingRepository } from '../../backend/test-support/memoryDevicePairingRepository.js';
import { createMemoryFamilyChildRepository } from '../../backend/test-support/memoryFamilyChildRepository.js';
import { createMemoryPolicyRepository } from '../../backend/test-support/memoryPolicyRepository.js';
import { createDeviceClient } from '../src/device-client.js';
import { createRuleManager } from '../src/rule-manager.js';
import { createServiceWorker } from '../src/service-worker.js';
import { matchesBlockedDomain, BLOCK_RESOURCE_TYPES } from '../src/domain-rules.js';

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    async get(key) {
      return { [key]: store[key] };
    },
    async set(entries) {
      Object.assign(store, entries);
    },
  };
}

function createMockDeclarativeNetRequest() {
  let rules = [];
  const calls = [];
  return {
    get calls() { return calls; },
    get rules() { return rules; },
    async getDynamicRules() {
      return structuredClone(rules);
    },
    async updateDynamicRules(update) {
      calls.push(structuredClone(update));
      const removed = new Set(update.removeRuleIds || []);
      const remaining = rules.filter((r) => !removed.has(r.id));
      if (Array.isArray(update.addRules)) {
        remaining.push(...structuredClone(update.addRules));
      }
      rules = remaining;
    },
  };
}

function createMockRuntime() {
  const messageListeners = [];
  const runtime = {
    id: 'kidsguard-extension-test-id',
    messageListeners,
    onMessage: {
      addListener(fn) {
        messageListeners.push(fn);
      },
    },
    async triggerMessage(message, sender = { id: 'kidsguard-extension-test-id' }) {
      return new Promise((resolve) => {
        for (const fn of messageListeners) {
          fn(message, sender, resolve);
        }
      });
    },
  };
  return runtime;
}

test('End-to-end integration: Chrome extension synchronizes parent-managed policy over real HTTP', async () => {
  // 1. Setup backend in-memory services and start ephemeral HTTP server
  const familyChildRepo = createMemoryFamilyChildRepository();
  const devicePairingRepo = createMemoryDevicePairingRepository();
  const policyRepo = createMemoryPolicyRepository();

  const familyChildService = createFamilyChildService({ repository: familyChildRepo });
  const devicePairingService = createDevicePairingService({
    repository: devicePairingRepo,
    familyChildRepository: familyChildRepo,
  });
  const policyService = createPolicyService({
    repository: policyRepo,
    familyChildRepository: familyChildRepo,
    devicePairingRepository: devicePairingRepo,
  });

  const parent = { id: '64b000000000000000000001', email: 'parent@example.com' };
  const authService = {
    async register() {},
    async login() {},
    async logout() {},
    async authenticate() { return parent; },
  };

  const app = createApp({
    authService,
    familyChildService,
    devicePairingService,
    policyService,
    runtimeEnv: {
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const apiBaseUrl = `http://127.0.0.1:${address.port}/api/v1`;

  try {
    // 2. Parent creates child profile and generates pairing code
    const child = await familyChildService.createChild(parent.id, { displayName: 'Alex' });
    const pairing = await devicePairingService.createPairingCode(parent.id, child.id);
    assert.equal(typeof pairing.code, 'string');
    assert.equal(pairing.code.length, 22);

    // 3. Parent sets initial website restrictions in backend
    const updatedPolicy = await policyService.updatePolicy(parent.id, child.id, {
      webRestrictions: {
        enabled: true,
        blockAdultContent: false,
        blockedDomains: ['badsite.example', 'gambling.co.uk'],
      },
    });
    assert.equal(updatedPolicy.version, 1);
    assert.deepEqual(updatedPolicy.webRestrictions.blockedDomains, ['badsite.example', 'gambling.co.uk']);

    // 4. Setup extension components pointing to the running backend
    const storage = createMockStorage();
    const dnr = createMockDeclarativeNetRequest();
    const runtime = createMockRuntime();

    const deviceClient = createDeviceClient({
      storage,
      apiBaseUrl,
      fetch: globalThis.fetch,
    });
    const ruleManager = createRuleManager({
      declarativeNetRequest: dnr,
      storage,
    });
    const serviceWorker = createServiceWorker({
      ruleManager,
      deviceClient,
      runtime,
    });
    await serviceWorker.init();

    // 5. Extension popup triggers redeemPairingCode via runtime message
    const redeemResult = await runtime.triggerMessage({
      action: 'redeemPairingCode',
      code: pairing.code,
      name: "Alex's Chrome Profile",
      platform: 'linux',
    });
    assert.equal(redeemResult.ok, true);
    assert.equal(redeemResult.device.pairingStatus, 'paired');
    assert.equal(redeemResult.device.deviceName, "Alex's Chrome Profile");
    // Raw credential must not be exposed in device status
    assert.equal(redeemResult.device.deviceCredential, undefined);

    // 6. Extension performs policy synchronization
    const syncResult = await runtime.triggerMessage({ action: 'syncPolicy' });
    assert.equal(syncResult.ok, true);
    assert.equal(syncResult.applied, true);
    assert.deepEqual(syncResult.configuredDomains, ['badsite.example', 'gambling.co.uk']);
    assert.deepEqual(syncResult.appliedDomains, ['badsite.example', 'gambling.co.uk']);

    // 7. Verify dynamic rules were created in Chrome DNR
    const activeRules = await dnr.getDynamicRules();
    assert.equal(activeRules.length, 2);
    assert.equal(activeRules[0].id, 1000);
    assert.equal(activeRules[0].action.type, 'block');
    assert.equal(activeRules[0].condition.urlFilter, '||badsite.example^');
    assert.deepEqual(activeRules[0].condition.resourceTypes, BLOCK_RESOURCE_TYPES);
    assert.deepEqual(activeRules[0].condition.requestDomains, ['badsite.example']);
    assert.equal(activeRules[1].id, 1001);
    assert.equal(activeRules[1].condition.urlFilter, '||gambling.co.uk^');
    assert.deepEqual(activeRules[1].condition.resourceTypes, BLOCK_RESOURCE_TYPES);
    assert.deepEqual(activeRules[1].condition.requestDomains, ['gambling.co.uk']);

    // Verify subdomain matching engine
    assert.equal(matchesBlockedDomain('https://badsite.example/login', 'badsite.example'), true);
    assert.equal(matchesBlockedDomain('https://sub.badsite.example/page', 'badsite.example'), true);
    assert.equal(matchesBlockedDomain('https://safe.example/home', 'badsite.example'), false);

    // 8. Verify backend acknowledges the synced version on the device registration
    const devices = await devicePairingService.listDevices(parent.id);
    assert.equal(devices.length, 1);
    assert.equal(devices[0].acknowledgedPolicyVersion, 1);
    assert.ok(devices[0].lastPolicyAckAt);

    // 9. Parent updates policy to disable web restrictions
    await policyService.updatePolicy(parent.id, child.id, {
      webRestrictions: {
        enabled: false,
        blockedDomains: [],
      },
    });

    // 10. Extension re-syncs policy: rules must be cleared from Chrome DNR
    const disabledSyncResult = await runtime.triggerMessage({ action: 'syncPolicy' });
    assert.equal(disabledSyncResult.ok, true);
    assert.equal(disabledSyncResult.applied, true);
    assert.deepEqual(disabledSyncResult.configuredDomains, []);
    assert.deepEqual(disabledSyncResult.appliedDomains, []);

    const clearedRules = await dnr.getDynamicRules();
    assert.equal(clearedRules.length, 0);

    const devicesAfterUpdate = await devicePairingService.listDevices(parent.id);
    assert.equal(devicesAfterUpdate[0].acknowledgedPolicyVersion, 2);

    // 11. Child-side attempts to add or remove domains are rejected
    const addAttempt = await runtime.triggerMessage({ action: 'addDomain', domain: 'unauthorized.com' });
    assert.equal(addAttempt.ok, false);
    assert.match(addAttempt.error, /parent-managed/u);

    const removeAttempt = await runtime.triggerMessage({ action: 'removeDomain', domain: 'badsite.example' });
    assert.equal(removeAttempt.ok, false);
    assert.match(removeAttempt.error, /parent-managed/u);

    const clearAttempt = await runtime.triggerMessage({ action: 'clearDeviceSession' });
    assert.equal(clearAttempt.ok, false);
    assert.match(clearAttempt.error, /parent-managed/u);

    // 12. Parent revokes the device
    await devicePairingService.revokeDevice(parent.id, devices[0].id);

    // Subsequent sync fails with 401 and transitions to invalid_session neutrally
    const revokedSync = await runtime.triggerMessage({ action: 'syncPolicy' });
    assert.equal(revokedSync.ok, false);
    assert.equal(revokedSync.status, 'invalid_session');
    assert.match(revokedSync.error, /invalid or expired/u);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
