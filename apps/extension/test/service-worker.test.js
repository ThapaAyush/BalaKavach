import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createServiceWorker,
  reconcileAlarm,
  executeHeartbeat,
  executePolicySync,
  syncWebHistory,
  HEARTBEAT_ALARM_NAME,
  HEARTBEAT_INTERVAL_MINUTES,
} from '../src/service-worker.js';

function createMockAlarms(initialAlarms = {}) {
  const alarmsMap = new Map(Object.entries(initialAlarms));
  const listeners = [];
  return {
    alarmsMap,
    listeners,
    async get(name) {
      return alarmsMap.get(name) ?? null;
    },
    async create(name, info) {
      alarmsMap.set(name, { name, ...info });
    },
    onAlarm: {
      addListener(fn) {
        listeners.push(fn);
      },
    },
    async trigger(name) {
      const alarm = alarmsMap.get(name) ?? { name };
      for (const fn of listeners) {
        await fn(alarm);
      }
    },
  };
}

function createMockRuntime() {
  const messageListeners = [];
  const installedListeners = [];
  const startupListeners = [];
  return {
    messageListeners,
    installedListeners,
    startupListeners,
    onMessage: {
      addListener(fn) { messageListeners.push(fn); },
    },
    onInstalled: {
      addListener(fn) { installedListeners.push(fn); },
    },
    onStartup: {
      addListener(fn) { startupListeners.push(fn); },
    },
    async triggerMessage(message, sender = {}) {
      return new Promise((resolve) => {
        for (const fn of messageListeners) {
          fn(message, sender, resolve);
        }
      });
    },
    async triggerInstalled() {
      for (const fn of installedListeners) fn();
    },
    async triggerStartup() {
      for (const fn of startupListeners) fn();
    },
  };
}

function createMockRuleManager(initialDomains = ['blocked.example']) {
  let domains = [...initialDomains];
  let appliedRules = [...initialDomains];
  let clearCalled = false;
  return {
    get domains() { return domains; },
    get appliedRules() { return appliedRules; },
    get clearCalled() { return clearCalled; },
    async getStatus() {
      return {
        configuredDomains: domains,
        appliedDomains: appliedRules,
        applied: true,
      };
    },
    async addDomain(d) {
      domains.push(d);
      return domains;
    },
    async removeDomain(d) {
      domains = domains.filter((x) => x !== d);
      return domains;
    },
    async applyConfiguredRules() {
      appliedRules = [...domains];
      return {
        configuredDomains: domains,
        appliedDomains: appliedRules,
        applied: true,
      };
    },
    async syncParentPolicy(policy) {
      if (policy?.webRestrictions?.enabled) {
        domains = [...(policy.webRestrictions.blockedDomains || [])];
      } else {
        domains = [];
      }
      appliedRules = [...domains];
      return {
        configuredDomains: domains,
        appliedDomains: appliedRules,
        applied: true,
      };
    },
    async clearManagedRules() {
      clearCalled = true;
      appliedRules = [];
    },
  };
}

function createMockDeviceClient({
  initialStatus = {
    isPaired: true,
    pairingStatus: 'paired',
    deviceId: 'dev-123',
    deviceName: 'Alex Chromebook',
    childProfileId: 'child-456',
    platform: 'linux',
    pairedAt: '2026-10-14T10:00:00.000Z',
    lastSeenAt: null,
    lastHeartbeatAt: null,
    lastHeartbeatStatus: null,
    acknowledgedPolicyVersion: 0,
    policyVersion: null,
    lastPolicySyncAt: null,
  },
  onHeartbeat,
  onFetchPolicy,
  onAcknowledgePolicy,
  onRedeem,
  onClear,
} = {}) {
  let status = { ...initialStatus };
  const heartbeatCalls = [];
  const ackCalls = [];
  return {
    get currentStatus() { return status; },
    set currentStatus(val) { status = val; },
    heartbeatCalls,
    ackCalls,
    async getStatus() {
      return { ...status };
    },
    async sendHeartbeat() {
      heartbeatCalls.push(new Date().toISOString());
      if (onHeartbeat) return onHeartbeat(status);
      status.lastSeenAt = '2026-10-14T10:15:00.000Z';
      status.lastHeartbeatAt = '2026-10-14T10:15:00.000Z';
      status.lastHeartbeatStatus = 'ok';
      return {
        ok: true,
        status: 'ok',
        device: { ...status },
      };
    },
    async fetchPolicy() {
      if (onFetchPolicy) return onFetchPolicy(status);
      return {
        ok: true,
        status: 'ok',
        policy: {
          version: 2,
          webRestrictions: {
            enabled: true,
            blockedDomains: ['policy-blocked.example'],
          },
        },
      };
    },
    async acknowledgePolicy(version) {
      ackCalls.push(version);
      if (onAcknowledgePolicy) return onAcknowledgePolicy(version);
      status.acknowledgedPolicyVersion = version;
      return { ok: true, status: 'ok' };
    },
    async redeemPairingCode(params) {
      if (onRedeem) return onRedeem(params);
      status = {
        isPaired: true,
        pairingStatus: 'paired',
        deviceId: 'dev-redeemed',
        deviceName: params.name,
        childProfileId: 'child-456',
        platform: params.platform || 'unknown',
        pairedAt: '2026-10-14T10:00:00.000Z',
        lastSeenAt: null,
        lastHeartbeatAt: null,
        lastHeartbeatStatus: null,
        acknowledgedPolicyVersion: 0,
        policyVersion: null,
        lastPolicySyncAt: null,
      };
      return { ...status };
    },
    async clearSession() {
      if (onClear) return onClear();
      status = {
        isPaired: false,
        pairingStatus: 'unpaired',
        deviceId: null,
        deviceName: null,
        childProfileId: null,
        platform: null,
        pairedAt: null,
        lastSeenAt: null,
        lastHeartbeatAt: null,
        lastHeartbeatStatus: null,
        acknowledgedPolicyVersion: 0,
        policyVersion: null,
        lastPolicySyncAt: null,
      };
      return { ...status };
    },
  };
}

test('reconcileAlarm creates 15-minute heartbeat alarm when none exists', async () => {
  const alarms = createMockAlarms();
  await reconcileAlarm(alarms);

  const created = alarms.alarmsMap.get(HEARTBEAT_ALARM_NAME);
  assert.ok(created);
  assert.equal(created.name, HEARTBEAT_ALARM_NAME);
  assert.equal(created.periodInMinutes, HEARTBEAT_INTERVAL_MINUTES);
});

test('reconcileAlarm recovers or preserves existing heartbeat alarm', async () => {
  // 1. Preserves existing alarm with correct period
  const alarms = createMockAlarms({
    [HEARTBEAT_ALARM_NAME]: { name: HEARTBEAT_ALARM_NAME, periodInMinutes: 15 },
  });
  let createCalled = false;
  const originalCreate = alarms.create;
  alarms.create = async (...args) => {
    createCalled = true;
    return originalCreate.apply(alarms, args);
  };
  await reconcileAlarm(alarms);
  assert.equal(createCalled, false, 'Should not recreate an already-valid alarm');

  // 2. Replaces alarm if period is wrong (e.g. 30 instead of 15)
  const wrongPeriodAlarms = createMockAlarms({
    [HEARTBEAT_ALARM_NAME]: { name: HEARTBEAT_ALARM_NAME, periodInMinutes: 30 },
  });
  await reconcileAlarm(wrongPeriodAlarms);
  const updated = wrongPeriodAlarms.alarmsMap.get(HEARTBEAT_ALARM_NAME);
  assert.equal(updated.periodInMinutes, 15);
});

test('service worker init sets up alarm, runtime listeners, and startup reconciliation', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager();
  const deviceClient = createMockDeviceClient();

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  await sw.init();

  // 1. Listeners registered
  assert.equal(alarms.listeners.length, 1);
  assert.equal(runtime.messageListeners.length, 1);
  assert.equal(runtime.installedListeners.length, 1);
  assert.equal(runtime.startupListeners.length, 1);

  // 2. Startup reconciliation created the alarm
  const alarm = alarms.alarmsMap.get(HEARTBEAT_ALARM_NAME);
  assert.ok(alarm);
  assert.equal(alarm.periodInMinutes, 15);
});

test('alarm trigger executes heartbeat and synchronizes parent policy when paired', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager(['initial.com']);
  const deviceClient = createMockDeviceClient();

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  sw.init();

  // Trigger heartbeat alarm
  await alarms.trigger(HEARTBEAT_ALARM_NAME);

  assert.equal(deviceClient.heartbeatCalls.length, 1);
  assert.equal(deviceClient.currentStatus.lastHeartbeatStatus, 'ok');

  // DNR rules synchronized from parent policy!
  assert.deepEqual(ruleManager.appliedRules, ['policy-blocked.example']);
  assert.equal(deviceClient.ackCalls[0], 2);

  // Unrelated alarm is ignored
  await alarms.trigger('unrelated_alarm');
  assert.equal(deviceClient.heartbeatCalls.length, 1);
});

test('offline heartbeat failure preserves session, schedules retry, and does not alter DNR rules', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager(['blocked.com']);
  const deviceClient = createMockDeviceClient({
    onHeartbeat: (status) => {
      status.lastHeartbeatStatus = 'offline';
      return {
        ok: false,
        status: 'offline',
        error: 'Network unavailable. Heartbeat will retry later.',
      };
    },
  });

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  sw.init();

  // First alarm: offline failure
  await alarms.trigger(HEARTBEAT_ALARM_NAME);
  assert.equal(deviceClient.heartbeatCalls.length, 1);
  assert.equal(deviceClient.currentStatus.isPaired, true); // Still paired!
  assert.equal(deviceClient.currentStatus.pairingStatus, 'paired');
  assert.equal(deviceClient.currentStatus.lastHeartbeatStatus, 'offline');
  assert.equal(ruleManager.clearCalled, false);

  // Next alarm: will retry because isPaired remains true
  await alarms.trigger(HEARTBEAT_ALARM_NAME);
  assert.equal(deviceClient.heartbeatCalls.length, 2);
  assert.deepEqual(ruleManager.appliedRules, ['blocked.com']);
});

test('HTTP 401 transitions session to invalid_session and skips subsequent heartbeats', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager(['blocked.com']);
  const deviceClient = createMockDeviceClient({
    onHeartbeat: (status) => {
      status.isPaired = false;
      status.pairingStatus = 'invalid_session';
      status.lastHeartbeatStatus = 'invalid_session';
      return {
        ok: false,
        status: 'invalid_session',
        error: 'Device session is invalid or expired. Re-pairing is required.',
      };
    },
  });

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  sw.init();

  // First alarm: encounters 401
  await alarms.trigger(HEARTBEAT_ALARM_NAME);
  assert.equal(deviceClient.heartbeatCalls.length, 1);
  assert.equal(deviceClient.currentStatus.isPaired, false);
  assert.equal(deviceClient.currentStatus.pairingStatus, 'invalid_session');
  assert.equal(ruleManager.clearCalled, false);

  // Subsequent alarms: heartbeat skipped because status is invalid_session!
  await alarms.trigger(HEARTBEAT_ALARM_NAME);
  assert.equal(deviceClient.heartbeatCalls.length, 1, 'Should NOT send heartbeat when invalid_session');
  assert.deepEqual(ruleManager.appliedRules, ['blocked.com']);
});

test('runtime message dispatch handles getState, getDeviceStatus, and rejects child-side editing', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager(['initial.com']);
  const deviceClient = createMockDeviceClient();

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  sw.init();

  // 1. getState returns both domain rules and sanitized device info
  const state = await runtime.triggerMessage({ action: 'getState' });
  assert.equal(state.ok, true);
  assert.deepEqual(state.configuredDomains, ['initial.com']);
  assert.equal(state.device.isPaired, true);
  assert.equal(state.device.deviceId, 'dev-123');
  assert.equal(state.device.deviceCredential, undefined);

  // 2. getDeviceStatus returns device status only
  const devStatus = await runtime.triggerMessage({ action: 'getDeviceStatus' });
  assert.equal(devStatus.ok, true);
  assert.equal(devStatus.device.deviceId, 'dev-123');
  assert.equal(devStatus.device.deviceCredential, undefined);

  // 3. Child domain modification is rejected
  const addRes = await runtime.triggerMessage({ action: 'addDomain', domain: 'new.org' });
  assert.equal(addRes.ok, false);
  assert.match(addRes.error, /parent-managed/u);

  const removeRes = await runtime.triggerMessage({ action: 'removeDomain', domain: 'initial.com' });
  assert.equal(removeRes.ok, false);
  assert.match(removeRes.error, /parent-managed/u);

  // 4. syncPolicy triggers dynamic rule sync
  const syncRes = await runtime.triggerMessage({ action: 'syncPolicy' });
  assert.equal(syncRes.ok, true);
  assert.deepEqual(syncRes.configuredDomains, ['policy-blocked.example']);
  assert.equal(deviceClient.ackCalls[0], 2);
});

test('runtime message dispatch validates input on redeemPairingCode and rejects clearDeviceSession', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager();
  const deviceClient = createMockDeviceClient();

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  sw.init();

  // 1. Invalid pairing code format rejected
  const badCode = await runtime.triggerMessage({
    action: 'redeemPairingCode',
    code: 'invalid!',
    name: 'Chromebook',
  });
  assert.equal(badCode.ok, false);
  assert.match(badCode.error, /22-character base64url/u);

  // 2. Invalid device name rejected
  const badName = await runtime.triggerMessage({
    action: 'redeemPairingCode',
    code: 'ABCDEFabcdef01234567-_',
    name: '',
  });
  assert.equal(badName.ok, false);
  assert.match(badName.error, /between 1 and 60 characters/u);

  // 3. Valid redemption succeeds and returns sanitized device
  const validRedeem = await runtime.triggerMessage({
    action: 'redeemPairingCode',
    code: 'ABCDEFabcdef01234567-_',
    name: 'Alex Chromebook',
    platform: 'linux',
  });
  assert.equal(validRedeem.ok, true);
  assert.equal(validRedeem.device.deviceId, 'dev-redeemed');
  assert.equal(validRedeem.device.deviceCredential, undefined);

  // 4. clearDeviceSession is rejected as parent-managed
  const cleared = await runtime.triggerMessage({ action: 'clearDeviceSession' });
  assert.equal(cleared.ok, false);
  assert.match(cleared.error, /parent-managed/u);

  // 5. Unsupported request fails safely
  const unsupported = await runtime.triggerMessage({ action: 'unknownAction' });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error, 'Unsupported request.');
});

test('secrets and device credentials are never disclosed through runtime messages or errors', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager();
  const secret = 'ultra-secret-device-bearer-credential-43chr';
  const deviceClient = createMockDeviceClient({
    initialStatus: {
      isPaired: true,
      pairingStatus: 'paired',
      deviceId: 'dev-123',
      deviceName: 'Device',
      deviceCredential: secret,
    },
  });

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  sw.init();

  const state = await runtime.triggerMessage({ action: 'getState' });
  assert.equal(JSON.stringify(state).includes(secret), false);

  const status = await runtime.triggerMessage({ action: 'getDeviceStatus' });
  assert.equal(JSON.stringify(status).includes(secret), false);

  const hb = await runtime.triggerMessage({ action: 'sendHeartbeat' });
  assert.equal(JSON.stringify(hb).includes(secret), false);
});

test('runtime messages reject unauthorized senders, web tabs, or mismatched extension IDs', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  runtime.id = 'kidsguard-extension-id';
  const ruleManager = createMockRuleManager();
  const deviceClient = createMockDeviceClient();

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  sw.init();

  // 1. Sender with mismatched ID rejected
  const badIdRes = await runtime.triggerMessage(
    { action: 'getState' },
    { id: 'malicious-extension-id' },
  );
  assert.equal(badIdRes.ok, false);
  assert.equal(badIdRes.error, 'Unauthorized request origin.');

  // 2. Sender from webpage tab rejected
  const tabRes = await runtime.triggerMessage(
    { action: 'getState' },
    { id: 'kidsguard-extension-id', tab: { id: 101, url: 'https://evil.example.com' } },
  );
  assert.equal(tabRes.ok, false);
  assert.equal(tabRes.error, 'Unauthorized request origin.');

  // 3. Sender with web URL rejected
  const urlRes = await runtime.triggerMessage(
    { action: 'getState' },
    { url: 'https://evil.example.com' },
  );
  assert.equal(urlRes.ok, false);
  assert.equal(urlRes.error, 'Unauthorized request origin.');

  // 4. Authorized extension sender accepted
  const okRes = await runtime.triggerMessage(
    { action: 'getState' },
    { id: 'kidsguard-extension-id' },
  );
  assert.equal(okRes.ok, true);
});

test('runtime messages reject modification requests with parent-managed guidance', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager();
  const deviceClient = createMockDeviceClient();

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
  });
  sw.init();

  // 1. addDomain rejected
  const badDomain = await runtime.triggerMessage({ action: 'addDomain', domain: 'example.com' });
  assert.equal(badDomain.ok, false);
  assert.match(badDomain.error, /parent-managed from the KidsGuard web dashboard/u);

  // 2. removeDomain rejected
  const removeRes = await runtime.triggerMessage({ action: 'removeDomain', domain: 'example.com' });
  assert.equal(removeRes.ok, false);
  assert.match(removeRes.error, /parent-managed from the KidsGuard web dashboard/u);

  // 3. Non-string platform rejected on redeemPairingCode
  const badPlatform = await runtime.triggerMessage({
    action: 'redeemPairingCode',
    code: 'ABCDEFabcdef01234567-_',
    name: 'Chromebook',
    platform: 999,
  });
  assert.equal(badPlatform.ok, false);
  assert.match(badPlatform.error, /Platform must be a non-empty string/u);
});

function createMockTabs(initialTabs = []) {
  let tabs = [...initialTabs];
  const removedTabIds = [];
  const updatedListeners = [];
  const createdListeners = [];
  return {
    get currentTabs() { return tabs; },
    get removedTabIds() { return removedTabIds; },
    async query() {
      return [...tabs];
    },
    async remove(ids) {
      const idList = Array.isArray(ids) ? ids : [ids];
      removedTabIds.push(...idList);
      tabs = tabs.filter((t) => !idList.includes(t.id));
    },
    onUpdated: {
      addListener(fn) { updatedListeners.push(fn); },
    },
    onCreated: {
      addListener(fn) { createdListeners.push(fn); },
    },
    async triggerUpdate(tabId, changeInfo, tab) {
      for (const fn of updatedListeners) {
        await fn(tabId, changeInfo, tab);
      }
    },
    async triggerCreate(tab) {
      for (const fn of createdListeners) {
        await fn(tab);
      }
    },
  };
}

test('spontaneously closes all 18+ adult tabs when extension connects via redeemPairingCode', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager();
  // Device starts unpaired before connection
  const deviceClient = createMockDeviceClient({
    initialStatus: { isPaired: false, pairingStatus: 'unpaired' }
  });

  // Child has open tabs before pairing: two adult tabs and one educational tab
  const mockTabs = createMockTabs([
    { id: 101, url: 'https://www.pornhub.com/video/123' },
    { id: 102, url: 'https://en.wikipedia.org/wiki/Mathematics' },
    { id: 103, url: 'https://www.google.com/search?q=free+xxx+clips' },
  ]);

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
    tabs: mockTabs,
  });
  await sw.init();

  // User connects extension by redeeming pairing code from the parent website
  const redeemResult = await runtime.triggerMessage({
    action: 'redeemPairingCode',
    code: 'ABCDEFabcdef01234567-_',
    name: "Alex's Chrome Profile",
    platform: 'linux',
  });

  assert.equal(redeemResult.ok, true);
  assert.equal(redeemResult.device.pairingStatus, 'paired');
  assert.equal(redeemResult.purgedAdultTabsCount, 2);

  // Both 18+ tabs (101 and 103) were spontaneously closed!
  assert.deepEqual(mockTabs.removedTabIds, [101, 103]);

  // Safe educational tab (102) remains untouched in Chrome
  assert.equal(mockTabs.currentTabs.length, 1);
  assert.equal(mockTabs.currentTabs[0].id, 102);
});

test('tabs.onUpdated real-time monitor spontaneously closes any tab navigating to 18+ content while paired', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager();
  const deviceClient = createMockDeviceClient();

  const mockTabs = createMockTabs([
    { id: 201, url: 'https://google.com' },
  ]);

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
    tabs: mockTabs,
  });
  await sw.init();

  // Tab navigates to benign research topic: not closed
  await mockTabs.triggerUpdate(201, { url: 'https://google.com/search?q=science+fair' }, { id: 201 });
  assert.equal(mockTabs.removedTabIds.length, 0);

  // Tab attempts to navigate to adult 18+ content: spontaneously removed!
  await mockTabs.triggerUpdate(201, { url: 'https://xvideos.com/watch' }, { id: 201 });
  assert.deepEqual(mockTabs.removedTabIds, [201]);
  assert.equal(mockTabs.currentTabs.length, 0);
});

test('purgeAdultTabs runtime message cleans up open adult tabs on demand', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager();
  const deviceClient = createMockDeviceClient();

  const mockTabs = createMockTabs();

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
    tabs: mockTabs,
  });
  await sw.init();

  // Open tabs are present after startup
  mockTabs.currentTabs.push(
    { id: 301, url: 'https://chaturbate.com/room' },
    { id: 302, url: 'https://khanacademy.org' }
  );

  const result = await runtime.triggerMessage({ action: 'purgeAdultTabs' });
  assert.equal(result.ok, true);
  assert.equal(result.purgedCount, 1);
  assert.deepEqual(result.removedTabIds, [301]);
  assert.equal(mockTabs.currentTabs.length, 1);
  assert.equal(mockTabs.currentTabs[0].id, 302);
});

test('syncWebHistory queries chrome.history.search, filters internal URLs, flags blocked visits, and sends to deviceClient', async () => {
  const sentVisits = [];
  const mockClient = {
    async getStatus() {
      return {
        deviceId: 'dev-123',
        pairingStatus: 'paired',
        isPaired: true,
      };
    },
    async sendWebHistory(visits) {
      sentVisits.push(...visits);
      return { ok: true, status: 'ok', ingestedCount: visits.length };
    },
  };

  const mockHistory = {
    async search() {
      return [
        { url: 'chrome://settings', title: 'Settings', lastVisitTime: 1792850000000, visitCount: 1 },
        { url: 'https://en.wikipedia.org/wiki/Solar_System', title: 'Solar System - Wikipedia', lastVisitTime: 1792850100000, visitCount: 2 },
        { url: 'https://pornhub.com/video', title: 'Video', lastVisitTime: 1792850200000, visitCount: 1 },
      ];
    },
  };

  const mockStorage = {
    data: {},
    async get(key) { return { [key]: this.data[key] }; },
    async set(obj) { Object.assign(this.data, obj); },
  };

  const result = await syncWebHistory({
    deviceClient: mockClient,
    history: mockHistory,
    storage: mockStorage,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ok');
  assert.equal(sentVisits.length, 2);

  // Chrome settings internal URL was excluded
  assert.equal(sentVisits.some((v) => v.url.includes('chrome://')), false);

  // Wikipedia was included and safe
  const wikiVisit = sentVisits.find((v) => v.url.includes('wikipedia.org'));
  assert.ok(wikiVisit);
  assert.equal(wikiVisit.domain, 'en.wikipedia.org');
  assert.equal(wikiVisit.isBlocked, false);
  assert.equal(wikiVisit.visitCount, 2);

  // Adult URL was included and flagged as blocked
  const adultVisit = sentVisits.find((v) => v.url.includes('pornhub.com'));
  assert.ok(adultVisit);
  assert.equal(adultVisit.isBlocked, true);

  // Timestamp was saved to prevent re-querying old items
  assert.ok(mockStorage.data.kidsguard_last_history_sync > 0);
});

test('redeemPairingCode spontaneously triggers web history synchronization upon pairing', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager();

  const sentVisits = [];
  const deviceClient = {
    session: null,
    async getStatus() {
      return this.session ?? { isPaired: false, pairingStatus: 'unpaired' };
    },
    async redeemPairingCode() {
      this.session = {
        deviceId: 'dev-123',
        deviceName: 'Alex Chrome',
        pairingStatus: 'paired',
        isPaired: true,
      };
      return this.session;
    },
    async fetchPolicy() {
      return { ok: true, policy: { version: 1 } };
    },
    async acknowledgePolicy() {
      return { ok: true };
    },
    async sendWebHistory(visits) {
      sentVisits.push(...visits);
      return { ok: true, status: 'ok', ingestedCount: visits.length };
    },
  };

  const mockHistory = {
    async search() {
      return [
        { url: 'https://nationalgeographic.com', title: 'National Geographic', lastVisitTime: 1792850300000, visitCount: 1 },
      ];
    },
  };

  const mockStorage = {
    data: {},
    async get(key) { return { [key]: this.data[key] }; },
    async set(obj) { Object.assign(this.data, obj); },
  };

  const sw = createServiceWorker({
    ruleManager,
    deviceClient,
    alarms,
    runtime,
    history: mockHistory,
    storage: mockStorage,
  });
  await sw.init();

  const response = await runtime.triggerMessage({
    action: 'redeemPairingCode',
    code: 'abcdefghijklmnopqrstuv',
    name: 'Alex Laptop',
  });

  assert.equal(response.ok, true);
  assert.equal(response.device.isPaired, true);

  // Allow serialize queue microtask to resolve
  await new Promise((r) => setTimeout(r, 20));

  // History was spontaneously uploaded to backend
  assert.equal(sentVisits.length, 1);
  assert.equal(sentVisits[0].domain, 'nationalgeographic.com');
  assert.equal(sentVisits[0].isBlocked, false);
});



