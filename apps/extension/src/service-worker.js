import { createRuleManager } from './rule-manager.js';
import {
  createDeviceClient,
  sanitizeDeviceStatus,
  DEFAULT_API_BASE_URL,
} from './device-client.js';
import {
  isAdultContentUrl,
  isQuietHoursActive,
  ADULT_18_PLUS_DOMAINS,
} from './domain-rules.js';

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

/**
 * Spontaneously purges all open Chrome tabs that match adult 18+ domains or content.
 */
export async function purgeAdultTabs(tabsApi, additionalBlockedDomains = []) {
  if (!tabsApi?.query || !tabsApi?.remove) {
    return { purgedCount: 0, removedTabIds: [] };
  }

  try {
    const tabs = await tabsApi.query({});
    if (!Array.isArray(tabs) || tabs.length === 0) {
      return { purgedCount: 0, removedTabIds: [] };
    }

    const tabsToClose = [];
    for (const tab of tabs) {
      if (tab?.id && tab?.url && isAdultContentUrl(tab.url, additionalBlockedDomains)) {
        tabsToClose.push(tab.id);
      }
    }

    if (tabsToClose.length > 0) {
      await tabsApi.remove(tabsToClose);
    }

    return {
      purgedCount: tabsToClose.length,
      removedTabIds: tabsToClose,
    };
  } catch (err) {
    return { purgedCount: 0, removedTabIds: [], error: err?.message };
  }
}

/**
 * Collects and synchronizes Chrome browsing history with the parent backend.
 */
export async function syncWebHistory({
  deviceClient,
  history,
  storage,
  ruleManager,
  lookbackDays = 7,
  maxResults = 200,
  immediateItem = null,
} = {}) {
  if (!deviceClient || !history?.search) {
    return { ok: false, status: 'unavailable', error: 'History API or device client unavailable.' };
  }

  const rawStatus = await deviceClient.getStatus();
  const status = sanitizeDeviceStatus(rawStatus);
  if (!status.isPaired) {
    return { ok: false, status: status.pairingStatus, skipped: true };
  }

  let lastSyncTime = 0;
  if (storage?.get) {
    try {
      const data = await storage.get('kidsguard_last_history_sync');
      if (typeof data?.kidsguard_last_history_sync === 'number') {
        lastSyncTime = data.kidsguard_last_history_sync;
      }
    } catch {
      // ignore
    }
  }

  const defaultStartTime = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);
  const startTime = lastSyncTime > 0 ? Math.max(lastSyncTime - 120_000, defaultStartTime) : defaultStartTime;

  let rawItems = [];
  try {
    rawItems = await history.search({
      text: '',
      startTime,
      maxResults,
    });
  } catch (err) {
    return { ok: false, status: 'error', error: err?.message || 'Failed to query Chrome history.' };
  }

  if (immediateItem && immediateItem.url) {
    if (!Array.isArray(rawItems)) rawItems = [];
    rawItems.unshift(immediateItem);
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: true, status: 'noop', count: 0 };
  }

  let configuredDomains = [];
  if (ruleManager && typeof ruleManager.getConfiguredDomains === 'function') {
    try {
      configuredDomains = await ruleManager.getConfiguredDomains();
    } catch {
      configuredDomains = [];
    }
  }

  const visits = [];
  const seenUrls = new Set();

  for (const item of rawItems) {
    if (!item?.url || typeof item.url !== 'string') continue;
    if (!/^https?:\/\//i.test(item.url)) {
      continue;
    }

    let domain = '';
    try {
      const parsed = new URL(item.url);
      domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      continue;
    }

    const visitKey = `${item.url}-${item.lastVisitTime || 0}`;
    if (seenUrls.has(visitKey)) continue;
    seenUrls.add(visitKey);

    const isBlocked = isAdultContentUrl(item.url, [...configuredDomains, ...ADULT_18_PLUS_DOMAINS]);
    let visitedAt;
    try {
      visitedAt = item.lastVisitTime && !isNaN(item.lastVisitTime) && item.lastVisitTime > 0
        ? new Date(item.lastVisitTime).toISOString()
        : new Date().toISOString();
    } catch {
      visitedAt = new Date().toISOString();
    }

    visits.push({
      url: item.url.slice(0, 2048),
      title: (item.title || domain || 'Web Page').slice(0, 500),
      domain: domain.slice(0, 253),
      visitedAt,
      visitCount: Math.max(Number(item.visitCount) || 1, 1),
      isBlocked,
    });
  }

  if (visits.length === 0) {
    return { ok: true, status: 'noop', count: 0 };
  }

  if (typeof deviceClient.sendWebHistory !== 'function') {
    return { ok: false, status: 'unsupported', error: 'deviceClient does not support sendWebHistory.' };
  }

  const BATCH_SIZE = 50;
  let totalIngested = 0;
  let lastError = null;

  for (let i = 0; i < visits.length; i += BATCH_SIZE) {
    const chunk = visits.slice(i, i + BATCH_SIZE);
    try {
      const uploadResult = await deviceClient.sendWebHistory(chunk);
      if (uploadResult?.ok) {
        totalIngested += (uploadResult.ingestedCount ?? chunk.length);
      } else {
        lastError = uploadResult?.error || 'Batch upload failed';
      }
    } catch (err) {
      lastError = err?.message || 'Network error during history sync';
    }
  }

  if (totalIngested > 0 || visits.length === 0) {
    if (storage?.set) {
      try {
        await storage.set({
          kidsguard_last_history_sync: Date.now(),
          kidsguard_last_history_count: totalIngested,
        });
      } catch {
        // ignore
      }
    }
    return { ok: true, status: 'ok', ingestedCount: totalIngested, totalAttempted: visits.length };
  }

  return { ok: false, status: 'error', error: lastError || 'Web history upload failed.' };
}

export async function executeHeartbeat(clientOrOptions, maybeRuleManager, maybeTabs, maybeHistory, maybeStorage) {
  let deviceClient;
  let ruleManager;
  let tabs;
  let history;
  let storage;

  if (clientOrOptions && typeof clientOrOptions.getStatus === 'function') {
    deviceClient = clientOrOptions;
    ruleManager = maybeRuleManager;
    tabs = maybeTabs;
    history = maybeHistory;
    storage = maybeStorage;
  } else if (clientOrOptions && typeof clientOrOptions === 'object') {
    deviceClient = clientOrOptions.deviceClient;
    ruleManager = clientOrOptions.ruleManager;
    tabs = clientOrOptions.tabs ?? maybeTabs;
    history = clientOrOptions.history ?? maybeHistory;
    storage = clientOrOptions.storage ?? maybeStorage;
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
        if (tabs && typeof ruleManager.getConfiguredDomains === 'function') {
          const configured = await ruleManager.getConfiguredDomains();
          await purgeAdultTabs(tabs, [...configured, ...ADULT_18_PLUS_DOMAINS]);
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

  // Synchronize web history during heartbeat cycle if available
  if (history && typeof deviceClient.sendWebHistory === 'function') {
    try {
      await syncWebHistory({ deviceClient, history, storage, ruleManager });
    } catch {
      // Background history sync non-blocking
    }
  }

  const updatedRaw = await deviceClient.getStatus();
  return {
    ok: true,
    status: 'ok',
    device: sanitizeDeviceStatus(updatedRaw),
  };
}

export async function executePolicySync(clientOrOptions, maybeRuleManager, maybeTabs, maybeStorage) {
  let deviceClient;
  let ruleManager;
  let tabs;
  let storage;

  if (clientOrOptions && typeof clientOrOptions.getStatus === 'function') {
    deviceClient = clientOrOptions;
    ruleManager = maybeRuleManager;
    tabs = maybeTabs;
    storage = maybeStorage;
  } else if (clientOrOptions && typeof clientOrOptions === 'object') {
    deviceClient = clientOrOptions.deviceClient;
    ruleManager = clientOrOptions.ruleManager;
    tabs = clientOrOptions.tabs ?? maybeTabs;
    storage = clientOrOptions.storage ?? maybeStorage;
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
    // Purge open adult tabs during policy synchronization
    if (tabs && typeof ruleManager.getConfiguredDomains === 'function') {
      const configured = await ruleManager.getConfiguredDomains();
      await purgeAdultTabs(tabs, [...configured, ...ADULT_18_PLUS_DOMAINS]);
    }
    if (storage?.set && policyResult.policy?.screenTime?.quietHours) {
      try {
        await storage.set({ kidsguard_quiet_hours: policyResult.policy.screenTime.quietHours });
      } catch {
        // ignore
      }
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
  tabs = typeof chrome !== 'undefined' ? chrome.tabs : undefined,
  history = typeof chrome !== 'undefined' ? chrome.history : undefined,
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
        return await serialize(async () => {
          const policyRes = await executePolicySync({ deviceClient: client, ruleManager: manager, tabs, storage });
          if (history) {
            try {
              await syncWebHistory({ deviceClient: client, history, storage, ruleManager: manager });
            } catch {
              // Ignore background history sync errors
            }
          }
          return policyRes;
        });

      case 'getDeviceStatus':
        try {
          const device = sanitizeDeviceStatus(await client.getStatus());
          return { ok: true, device };
        } catch {
          return { ok: false, error: 'KidsGuard could not read device status.' };
        }

      case 'purgeAdultTabs': {
        try {
          const configured = typeof manager.getConfiguredDomains === 'function'
            ? await manager.getConfiguredDomains()
            : [];
          const result = await purgeAdultTabs(tabs, [...configured, ...ADULT_18_PLUS_DOMAINS]);
          return { ok: true, ...result };
        } catch (error) {
          return { ok: false, error: error?.message || 'Failed to purge adult tabs.' };
        }
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

          // SPONTANEOUS 18+ CONTENT REMOVAL:
          // Immediately purge all open Chrome tabs matching adult/18+ content the exact second extension connects!
          let purgedInfo = { purgedCount: 0, removedTabIds: [] };
          if (tabs) {
            try {
              purgedInfo = await purgeAdultTabs(tabs, ADULT_18_PLUS_DOMAINS);
            } catch {
              // Ignore in non-browser/mock test environments
            }
          }

          // Immediately perform initial policy synchronization upon pairing
          void serialize(() => executePolicySync({ deviceClient: client, ruleManager: manager, tabs, storage }));

          // Spontaneously harvest and sync Chrome browsing history so parent dashboard sees history upon connection!
          if (history) {
            void serialize(() => syncWebHistory({
              deviceClient: client,
              history,
              storage,
              ruleManager: manager,
            }));
          }

          const device = sanitizeDeviceStatus(rawDevice);

          if (device?.deviceId && typeof runtime?.setUninstallURL === 'function') {
            try {
              const effectiveBaseUrl = typeof client.getApiBaseUrl === 'function' ? await client.getApiBaseUrl() : DEFAULT_API_BASE_URL;
              const uninstallUrl = `${effectiveBaseUrl}/devices/${device.deviceId}/uninstalled`;
              await runtime.setUninstallURL(uninstallUrl);
            } catch {
              // Ignore in test or mock environments
            }
          }

          return { ok: true, device, purgedAdultTabsCount: purgedInfo.purgedCount };
        } catch (error) {
          return {
            ok: false,
            error: error?.message || 'Failed to redeem pairing code.',
          };
        }
      }

      case 'syncWebHistory': {
        try {
          const result = await serialize(() => syncWebHistory({
            deviceClient: client,
            history,
            storage,
            ruleManager: manager,
            lookbackDays: message.lookbackDays,
            maxResults: message.maxResults,
          }));
          return result;
        } catch (error) {
          return { ok: false, error: error?.message || 'Failed to sync web history.' };
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
          const result = await executeHeartbeat({ deviceClient: client, ruleManager: manager, tabs });
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
      return await executeHeartbeat({ deviceClient: client, ruleManager: manager, tabs, history, storage });
    } catch {
      // Avoid logging device credentials or internals
    }
  }

  async function purgePairedAdultTabs() {
    try {
      const rawStatus = await client.getStatus();
      const status = sanitizeDeviceStatus(rawStatus);
      if (status.isPaired && tabs) {
        const configured = typeof manager.getConfiguredDomains === 'function'
          ? await manager.getConfiguredDomains()
          : [];
        await purgeAdultTabs(tabs, [...configured, ...ADULT_18_PLUS_DOMAINS]);
      }
    } catch {
      // Ignore
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
        void purgePairedAdultTabs();
      });
    }

    if (runtime?.onStartup?.addListener) {
      runtime.onStartup.addListener(() => {
        void reconcileRules();
        void reconcileAlarm(alarms);
        void purgePairedAdultTabs();
      });
    }

    if (alarms?.onAlarm?.addListener) {
      alarms.onAlarm.addListener((alarm) => handleAlarm(alarm));
    }

    // Monitor tabs in real-time to spontaneously block 18+ content and capture browsing visits
    if (tabs?.onUpdated?.addListener) {
      tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        const url = changeInfo?.url || tab?.url;
        if (!url) return;
        try {
          const rawStatus = await client.getStatus();
          const status = sanitizeDeviceStatus(rawStatus);
          if (!status.isPaired) return;

          // Check if parent-configured quiet hours are active
          if (storage?.get) {
            try {
              const qhData = await storage.get('kidsguard_quiet_hours');
              if (qhData?.kidsguard_quiet_hours && isQuietHoursActive(qhData.kidsguard_quiet_hours) && /^https?:\/\//i.test(url)) {
                await tabs.remove(tabId);
                return;
              }
            } catch {
              // Ignore
            }
          }

          const configured = typeof manager.getConfiguredDomains === 'function'
            ? await manager.getConfiguredDomains()
            : [];
          if (isAdultContentUrl(url, [...configured, ...ADULT_18_PLUS_DOMAINS])) {
            await tabs.remove(tabId);
          } else if (changeInfo.status === 'complete' && /^https?:\/\//i.test(url)) {
            void serialize(() => syncWebHistory({
              deviceClient: client,
              history,
              storage,
              ruleManager: manager,
              immediateItem: { url, title: tab?.title || '', lastVisitTime: Date.now() },
            }));
          }
        } catch {
          // Tab could already be closing
        }
      });
    }

    if (tabs?.onCreated?.addListener) {
      tabs.onCreated.addListener(async (tab) => {
        if (!tab?.url || !tab?.id) return;
        try {
          const rawStatus = await client.getStatus();
          const status = sanitizeDeviceStatus(rawStatus);
          if (!status.isPaired) return;

          if (storage?.get) {
            try {
              const qhData = await storage.get('kidsguard_quiet_hours');
              if (qhData?.kidsguard_quiet_hours && isQuietHoursActive(qhData.kidsguard_quiet_hours) && /^https?:\/\//i.test(tab.url)) {
                await tabs.remove(tab.id);
                return;
              }
            } catch {
              // Ignore
            }
          }

          const configured = typeof manager.getConfiguredDomains === 'function'
            ? await manager.getConfiguredDomains()
            : [];
          if (isAdultContentUrl(tab.url, [...configured, ...ADULT_18_PLUS_DOMAINS])) {
            await tabs.remove(tab.id);
          }
        } catch {
          // Ignore
        }
      });
    }

    // Monitor history in real-time to harvest child browsing visits for the parent dashboard
    if (history?.onVisited?.addListener) {
      history.onVisited.addListener(async (historyItem) => {
        try {
          const rawStatus = await client.getStatus();
          const status = sanitizeDeviceStatus(rawStatus);
          if (!status.isPaired) return;
          void serialize(() => syncWebHistory({
            deviceClient: client,
            history,
            storage,
            ruleManager: manager,
            immediateItem: historyItem,
          }));
        } catch {
          // Ignore
        }
      });
    }

    // Always reconcile alarm, rules, purge open adult tabs, and sync web history on boot
    await Promise.allSettled([
      reconcileRules(),
      reconcileAlarm(alarms),
      purgePairedAdultTabs(),
      syncWebHistory({ deviceClient: client, history, storage, ruleManager: manager }),
    ]);
  }

  return {
    handleMessage,
    handleAlarm,
    reconcileRules,
    reconcileAlarm: () => reconcileAlarm(alarms),
    executeHeartbeat: () => executeHeartbeat({ deviceClient: client, ruleManager: manager, tabs, history, storage }),
    executePolicySync: () => executePolicySync({ deviceClient: client, ruleManager: manager, tabs, storage }),
    syncWebHistory: (opts = {}) => syncWebHistory({ deviceClient: client, history, storage, ruleManager: manager, ...opts }),
    purgeAdultTabs: () => purgeAdultTabs(tabs, ADULT_18_PLUS_DOMAINS),
    init,
    get manager() { return manager; },
    get deviceClient() { return client; },
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  const service = createServiceWorker();
  service.init();
}
