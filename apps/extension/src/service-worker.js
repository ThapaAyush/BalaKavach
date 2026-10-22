import { createRuleManager } from './rule-manager.js';
import {
  createDeviceClient,
  sanitizeDeviceStatus,
  DEFAULT_API_BASE_URL,
} from './device-client.js';

export const HEARTBEAT_ALARM_NAME = 'kidsguard_heartbeat';
export const HEARTBEAT_INTERVAL_MINUTES = 15;

export async function reconcileAlarm(alarms) {
  if (!alarms?.get || !alarms?.create) return;
  const existing = await alarms.get(HEARTBEAT_ALARM_NAME);
  if (!existing || existing.periodInMinutes !== HEARTBEAT_INTERVAL_MINUTES) {
    await alarms.create(HEARTBEAT_ALARM_NAME, {
      periodInMinutes: HEARTBEAT_INTERVAL_MINUTES,
    });
  }
}

export async function executeHeartbeat(clientOrOptions, maybeRuleManager) {
  let deviceClient;
  let ruleManager;

  if (clientOrOptions && typeof clientOrOptions.getStatus === 'function') {
    deviceClient = clientOrOptions;
    ruleManager = maybeRuleManager;
  } else if (clientOrOptions && typeof clientOrOptions === 'object') {
    deviceClient = clientOrOptions.deviceClient;
    ruleManager = clientOrOptions.ruleManager;
  }

  if (!deviceClient?.getStatus || !deviceClient?.sendHeartbeat) {
    return { ok: false, status: 'error', error: 'Device client is unavailable.' };
  }

  const rawStatus = await deviceClient.getStatus();
  const status = sanitizeDeviceStatus(rawStatus);
  if (!status.isPaired) {
    return { ok: false, status: status.pairingStatus, skipped: true };
  }

  const hbResult = await deviceClient.sendHeartbeat();
  if (!hbResult?.ok) {
    return hbResult;
  }

  // Synchronize parent policy during heartbeat cycle if available
  if (ruleManager && typeof deviceClient.fetchPolicy === 'function') {
    try {
      const policyResult = await deviceClient.fetchPolicy();
      if (policyResult?.ok && policyResult.policy) {
        if (typeof ruleManager.syncParentPolicy === 'function') {
          await ruleManager.syncParentPolicy(policyResult.policy);
        }
        const versionToAck = policyResult.policyVersion ?? policyResult.policy.version;
        if (versionToAck && typeof deviceClient.acknowledgePolicy === 'function') {
          await deviceClient.acknowledgePolicy(versionToAck);
        }
      }
    } catch {
      // Offline or network glitch during policy fetch: preserve existing active rules
    }
  }

  const updatedRaw = await deviceClient.getStatus();
  return {
    ok: true,
    status: 'ok',
    device: sanitizeDeviceStatus(updatedRaw),
  };
}

export async function executePolicySync(clientOrOptions, maybeRuleManager) {
  let deviceClient;
  let ruleManager;

  if (clientOrOptions && typeof clientOrOptions.getStatus === 'function') {
    deviceClient = clientOrOptions;
    ruleManager = maybeRuleManager;
  } else if (clientOrOptions && typeof clientOrOptions === 'object') {
    deviceClient = clientOrOptions.deviceClient;
    ruleManager = clientOrOptions.ruleManager;
  }

  if (!deviceClient || !ruleManager) {
    return { ok: false, error: 'Device client or rule manager unavailable.' };
  }

  const rawStatus = await deviceClient.getStatus();
  const status = sanitizeDeviceStatus(rawStatus);
  if (!status.isPaired) {
    return { ok: false, status: status.pairingStatus, error: 'Device is not paired.' };
  }

  const policyResult = await deviceClient.fetchPolicy();
  if (!policyResult?.ok) {
    const currentRuleStatus = await ruleManager.getStatus();
    return {
      ...policyResult,
      ...currentRuleStatus,
      device: status,
    };
  }

  try {
    if (typeof ruleManager.syncParentPolicy === 'function') {
      await ruleManager.syncParentPolicy(policyResult.policy);
    }
    const versionToAck = policyResult.policyVersion ?? policyResult.policy.version;
    if (versionToAck && typeof deviceClient.acknowledgePolicy === 'function') {
      await deviceClient.acknowledgePolicy(versionToAck);
    }
  } catch (error) {
    const currentRuleStatus = await ruleManager.getStatus();
    return {
      ok: false,
      ...currentRuleStatus,
      device: status,
      error: error?.message || 'Failed to apply parent rules in Chrome.',
    };
  }

  const ruleStatus = await ruleManager.getStatus();
  const updatedDevice = sanitizeDeviceStatus(await deviceClient.getStatus());

  return {
    ok: true,
    ...ruleStatus,
    device: updatedDevice,
  };
}

export function isAuthorizedSender(sender, runtime) {
  if (!sender) return true;
  if (sender.id && runtime?.id && sender.id !== runtime.id) {
    return false;
  }
  if (sender.tab) {
    return false;
  }
  if (typeof sender.url === 'string' && /^(https?|file):/iu.test(sender.url)) {
    return false;
  }
  return true;
}

export function createServiceWorker({
  ruleManager,
  deviceClient,
  alarms = typeof chrome !== 'undefined' ? chrome.alarms : undefined,
  runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined,
  storage = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined,
  declarativeNetRequest = typeof chrome !== 'undefined' ? chrome.declarativeNetRequest : undefined,
  fetch = globalThis.fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
} = {}) {
  const manager = ruleManager ?? createRuleManager({
    declarativeNetRequest,
    storage,
  });

  const client = deviceClient ?? createDeviceClient({
    storage,
    fetch,
    apiBaseUrl,
  });

  let operationQueue = Promise.resolve();
  function serialize(operation) {
    const next = operationQueue.then(operation, operation);
    operationQueue = next.catch(() => undefined);
    return next;
  }

  async function getPopupState() {
    let deviceStatus = null;
    try {
      deviceStatus = sanitizeDeviceStatus(await client.getStatus());
    } catch {
      deviceStatus = sanitizeDeviceStatus(null);
    }

    try {
      const status = await manager.getStatus();
      if (status.error) {
        return {
          ok: false,
          ...status,
          device: deviceStatus,
          error: 'KidsGuard could not confirm active Chrome rules. Inspect the extension errors and try again.',
        };
      }
      return { ok: true, ...status, device: deviceStatus };
    } catch {
      return {
        ok: false,
        configuredDomains: [],
        appliedDomains: [],
        applied: false,
        device: deviceStatus,
        error: 'KidsGuard could not read the saved list or current Chrome rules. Inspect the extension errors and try again.',
      };
    }
  }

  async function handleMessage(message, sender) {
    if (!message || typeof message !== 'object') {
      return { ok: false, error: 'Unsupported request.' };
    }

    if (!isAuthorizedSender(sender, runtime)) {
      return { ok: false, error: 'Unauthorized request origin.' };
    }

    switch (message.action) {
      case 'getState':
        return await getPopupState();

      case 'syncPolicy':
        return await serialize(() => executePolicySync({ deviceClient: client, ruleManager: manager }));

      case 'getDeviceStatus':
        try {
          const device = sanitizeDeviceStatus(await client.getStatus());
          return { ok: true, device };
        } catch {
          return { ok: false, error: 'KidsGuard could not read device status.' };
        }

      case 'redeemPairingCode': {
        const { code, name, platform, apiBaseUrl } = message;
        if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{22}$/u.test(code.trim())) {
          return { ok: false, error: 'Pairing code must be a 22-character base64url string.' };
        }
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
          return { ok: false, error: 'Device name must be between 1 and 60 characters.' };
        }
        if (platform !== undefined && (typeof platform !== 'string' || !platform.trim())) {
          return { ok: false, error: 'Platform must be a non-empty string if provided.' };
        }
        try {
          const rawDevice = await client.redeemPairingCode({
            code: code.trim(),
            name: name.trim(),
            platform,
            apiBaseUrl,
          });
          // Immediately perform initial policy synchronization upon pairing
          void serialize(() => executePolicySync({ deviceClient: client, ruleManager: manager }));
          const device = sanitizeDeviceStatus(rawDevice);
          return { ok: true, device };
        } catch (error) {
          return {
            ok: false,
            error: error?.message || 'Failed to redeem pairing code.',
          };
        }
      }

      case 'getApiBaseUrl': {
        try {
          const url = typeof client.getApiBaseUrl === 'function' ? await client.getApiBaseUrl() : undefined;
          return { ok: true, url };
        } catch (error) {
          return { ok: false, error: error?.message || 'Failed to get API base URL.' };
        }
      }

      case 'setApiBaseUrl': {
        try {
          const url = typeof client.setApiBaseUrl === 'function' ? await client.setApiBaseUrl(message.url) : message.url;
          return { ok: true, url };
        } catch (error) {
          return { ok: false, error: error?.message || 'Failed to set API base URL.' };
        }
      }

      case 'sendHeartbeat': {
        try {
          const result = await executeHeartbeat({ deviceClient: client, ruleManager: manager });
          return result;
        } catch (error) {
          return {
            ok: false,
            error: error?.message || 'Failed to send heartbeat.',
          };
        }
      }

      // Explicitly reject child-side policy mutation and unpairing
      case 'addDomain':
      case 'removeDomain':
      case 'clearDeviceSession':
        return {
          ok: false,
          error: 'Domain restrictions and device enrollment are parent-managed from the KidsGuard web dashboard.',
        };

      default:
        return { ok: false, error: 'Unsupported request.' };
    }
  }

  async function reconcileRules() {
    try {
      await serialize(() => manager.applyConfiguredRules());
    } catch {
      console.error('KidsGuard could not reconcile its local blocklist rules.');
    }
  }

  async function handleAlarm(alarm) {
    if (alarm?.name !== HEARTBEAT_ALARM_NAME) return;
    try {
      return await executeHeartbeat({ deviceClient: client, ruleManager: manager });
    } catch {
      // Avoid logging device credentials or internals
    }
  }

  async function init() {
    if (runtime?.onMessage?.addListener) {
      runtime.onMessage.addListener((message, sender, sendResponse) => {
        handleMessage(message, sender).then(sendResponse, () => sendResponse({
          ok: false,
          error: 'KidsGuard could not complete the request. Inspect the extension errors and try again.'
        }));
        return true;
      });
    }

    if (runtime?.onInstalled?.addListener) {
      runtime.onInstalled.addListener(() => {
        void reconcileRules();
        void reconcileAlarm(alarms);
      });
    }

    if (runtime?.onStartup?.addListener) {
      runtime.onStartup.addListener(() => {
        void reconcileRules();
        void reconcileAlarm(alarms);
      });
    }

    if (alarms?.onAlarm?.addListener) {
      alarms.onAlarm.addListener((alarm) => handleAlarm(alarm));
    }

    // Always reconcile alarm and rules on service worker boot
    await Promise.allSettled([
      reconcileRules(),
      reconcileAlarm(alarms),
    ]);
  }

  return {
    handleMessage,
    handleAlarm,
    reconcileRules,
    reconcileAlarm: () => reconcileAlarm(alarms),
    executeHeartbeat: () => executeHeartbeat({ deviceClient: client, ruleManager: manager }),
    executePolicySync: () => executePolicySync({ deviceClient: client, ruleManager: manager }),
    init,
    get manager() { return manager; },
    get deviceClient() { return client; },
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  const service = createServiceWorker();
  service.init();
}
