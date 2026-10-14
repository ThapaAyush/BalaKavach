import { createRuleManager } from './rule-manager.js';

const manager = createRuleManager({
  declarativeNetRequest: chrome.declarativeNetRequest,
  storage: chrome.storage.local
});

let operationQueue = Promise.resolve();
function serialize(operation) {
  const next = operationQueue.then(operation, operation);
  operationQueue = next.catch(() => undefined);
  return next;
}

async function getPopupState() {
  try {
    const status = await manager.getStatus();
    if (status.error) {
      return {
        ok: false,
        ...status,
        error: 'KidsGuard could not confirm active Chrome rules. Inspect the extension errors and try again.'
      };
    }
    return { ok: true, ...status };
  } catch {
    return {
      ok: false,
      configuredDomains: [],
      appliedDomains: [],
      applied: false,
      error: 'KidsGuard could not read the saved list or current Chrome rules. Inspect the extension errors and try again.'
    };
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') return { ok: false, error: 'Unsupported request.' };
  if (message.action === 'getState') return getPopupState();

  if (message.action !== 'addDomain' && message.action !== 'removeDomain') {
    return { ok: false, error: 'Unsupported request.' };
  }

  try {
    return await serialize(async () => {
      const configuredDomains = message.action === 'addDomain'
        ? await manager.addDomain(message.domain)
        : await manager.removeDomain(message.domain);
      try {
        const status = await manager.applyConfiguredRules();
        return { ok: true, ...status };
      } catch {
        return {
          ok: false,
          configuredDomains,
          appliedDomains: [],
          applied: false,
          error: 'The local list was saved, but Chrome did not apply the rules. Retry or inspect errors at chrome://extensions.'
        };
      }
    });
  } catch (error) {
    return {
      ...(await getPopupState()),
      ok: false,
      error: error instanceof RangeError
        ? 'The local blocklist is limited to 100 unique domains.'
        : error instanceof TypeError
          ? error.message
          : 'KidsGuard could not save the local list. Inspect the extension errors and try again.'
    };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse, () => sendResponse({
    ok: false,
    error: 'KidsGuard could not complete the request. Inspect the extension errors and try again.'
  }));
  return true;
});

async function reconcileRules() {
  try {
    await serialize(() => manager.applyConfiguredRules());
  } catch {
    // Avoid logging user-configured domains or browser error details.
    console.error('KidsGuard could not reconcile its local blocklist rules.');
  }
}

chrome.runtime.onInstalled.addListener(() => { void reconcileRules(); });
chrome.runtime.onStartup.addListener(() => { void reconcileRules(); });
