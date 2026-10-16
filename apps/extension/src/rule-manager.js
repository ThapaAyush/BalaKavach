import {
  createBlockRules,
  isKidsGuardRuleId,
  MAX_BLOCKED_DOMAINS,
  normalizeDomainInput,
  normalizeDomainList
} from './domain-rules.js';

export const BLOCKLIST_STORAGE_KEY = 'localBlockedDomains';

function sameRule(actual, expected) {
  if (!actual || actual.id !== expected.id || actual.priority !== expected.priority || actual.action?.type !== 'block') return false;
  const sameKeys = (left, right) => left &&
    JSON.stringify(Object.keys(left).sort()) === JSON.stringify(Object.keys(right).sort());
  if (!sameKeys(actual, expected) || !sameKeys(actual.action, expected.action) || !sameKeys(actual.condition, expected.condition)) return false;
  if (actual.condition?.urlFilter !== expected.condition?.urlFilter) return false;
  const sameArrays = (left, right) =>
    Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length &&
    JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  return sameArrays(actual.condition?.requestDomains, expected.condition?.requestDomains) &&
    sameArrays(actual.condition?.resourceTypes, expected.condition?.resourceTypes);
}

export function createRuleManager({ declarativeNetRequest, storage, maxDomains = MAX_BLOCKED_DOMAINS }) {
  if (!declarativeNetRequest || !storage) {
    throw new TypeError('Chrome rule and storage APIs are required.');
  }

  async function getConfiguredDomains() {
    const stored = await storage.get(BLOCKLIST_STORAGE_KEY);
    return normalizeDomainList(stored[BLOCKLIST_STORAGE_KEY] ?? [], maxDomains);
  }

  async function saveConfiguredDomains(domains) {
    const normalized = normalizeDomainList(domains, maxDomains);
    await storage.set({ [BLOCKLIST_STORAGE_KEY]: normalized });
    return normalized;
  }

  async function getStatus() {
    const configuredDomains = await getConfiguredDomains();
    const expectedRules = createBlockRules(configuredDomains, maxDomains);
    let existing;
    try {
      existing = await declarativeNetRequest.getDynamicRules();
    } catch {
      return { configuredDomains, appliedDomains: [], applied: false, error: 'Chrome rules could not be read.' };
    }
    const managedRules = existing.filter((rule) => isKidsGuardRuleId(rule.id, maxDomains));
    const same = managedRules.length === expectedRules.length && expectedRules.every((expected) => {
      const actual = managedRules.find((rule) => rule.id === expected.id);
      return sameRule(actual, expected);
    });
    return {
      configuredDomains,
      appliedDomains: same ? configuredDomains : [],
      applied: same
    };
  }

  async function applyConfiguredRules() {
    const configuredDomains = await getConfiguredDomains();
    const addRules = createBlockRules(configuredDomains, maxDomains);
    const currentRules = await declarativeNetRequest.getDynamicRules();
    const removeRuleIds = currentRules
      .filter((rule) => isKidsGuardRuleId(rule.id, maxDomains))
      .map((rule) => rule.id);

    const unchanged = removeRuleIds.length === addRules.length && addRules.every((rule) => {
      const current = currentRules.find((entry) => entry.id === rule.id);
      return sameRule(current, rule);
    });
    if (!unchanged) {
      // Chrome applies this update atomically: rejection leaves the old rules intact.
      await declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    }
    const status = await getStatus();
    if (!status.applied) throw new Error('Chrome did not confirm the requested dynamic rules.');
    return status;
  }

  /**
   * Synchronizes parent-configured web policy:
   * Saves normalized domains and updates Declarative Net Request dynamic rules.
   */
  async function syncParentPolicy(policy) {
    const webRestrictions = policy?.webRestrictions;
    const isEnabled = webRestrictions?.enabled !== false;
    const rawDomains = isEnabled && Array.isArray(webRestrictions?.blockedDomains)
      ? webRestrictions.blockedDomains
      : [];
    const normalized = normalizeDomainList(rawDomains, maxDomains);
    await saveConfiguredDomains(normalized);
    return await applyConfiguredRules();
  }

  async function addDomain(value) {
    const domain = normalizeDomainInput(value);
    const domains = await getConfiguredDomains();
    return saveConfiguredDomains([...domains, domain]);
  }

  async function removeDomain(value) {
    const domain = normalizeDomainInput(value);
    const domains = await getConfiguredDomains();
    return saveConfiguredDomains(domains.filter((item) => item !== domain));
  }

  async function clearManagedRules() {
    const currentRules = await declarativeNetRequest.getDynamicRules();
    const removeRuleIds = currentRules
      .filter((rule) => isKidsGuardRuleId(rule.id, maxDomains))
      .map((rule) => rule.id);
    if (removeRuleIds.length) {
      await declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [] });
    }
  }

  return {
    getConfiguredDomains,
    saveConfiguredDomains,
    getStatus,
    applyConfiguredRules,
    syncParentPolicy,
    addDomain,
    removeDomain,
    clearManagedRules
  };
}
