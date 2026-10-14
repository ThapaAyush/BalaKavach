import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createServiceWorker,
  reconcileAlarm,
  executeHeartbeat,
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
  },
  onHeartbeat,
  onRedeem,
  onClear,
} = {}) {
  let status = { ...initialStatus };
  const heartbeatCalls = [];
  return {
    get currentStatus() { return status; },
    set currentStatus(val) { status = val; },
    heartbeatCalls,
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

test('alarm trigger executes heartbeat when paired and leaves ruleManager untouched', async () => {
  const alarms = createMockAlarms();
  const runtime = createMockRuntime();
  const ruleManager = createMockRuleManager(['blocked.com']);
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

  // DNR rules untouched
  assert.equal(ruleManager.clearCalled, false);
  assert.deepEqual(ruleManager.appliedRules, ['blocked.com']);

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

test('runtime message dispatch handles getState, getDeviceStatus, and DNR operations', async () => {
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

  // 3. Domain operations continue functioning
  const addRes = await runtime.triggerMessage({ action: 'addDomain', domain: 'new.org' });
  assert.equal(addRes.ok, true);
  assert.deepEqual(addRes.configuredDomains, ['initial.com', 'new.org']);
});

test('runtime message dispatch validates input on redeemPairingCode and clearDeviceSession', async () => {
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

  // 4. clearDeviceSession resets pairing status
  const cleared = await runtime.triggerMessage({ action: 'clearDeviceSession' });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.device.isPaired, false);
  assert.equal(cleared.device.pairingStatus, 'unpaired');

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
      deviceCredential: secret, // Raw credential in client boundary
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

test('runtime messages validate domain and platform inputs strictly', async () => {
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

  // 1. Non-string domain rejected
  const badDomain = await runtime.triggerMessage({ action: 'addDomain', domain: 12345 });
  assert.equal(badDomain.ok, false);
  assert.match(badDomain.error, /Domain must be a non-empty string/u);

  // 2. Empty domain rejected
  const emptyDomain = await runtime.triggerMessage({ action: 'addDomain', domain: '   ' });
  assert.equal(emptyDomain.ok, false);
  assert.match(emptyDomain.error, /Domain must be a non-empty string/u);

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

