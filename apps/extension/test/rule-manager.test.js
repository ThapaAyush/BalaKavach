import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuleManager, BLOCKLIST_STORAGE_KEY } from '../src/rule-manager.js';

function harness({ rejectUpdate = false, rejectRead = false } = {}) {
  const values = {};
  let rules = [{ id: 50, priority: 1, action: { type: 'allow' }, condition: { urlFilter: '||safe.example' } }];
  const calls = [];
  const storage = {
    async get(key) { return { [key]: values[key] }; },
    async set(entries) { Object.assign(values, entries); }
  };
  const declarativeNetRequest = {
    async getDynamicRules() {
      if (rejectRead) throw new Error('simulated Chrome read failure');
      return structuredClone(rules);
    },
    async updateDynamicRules(update) {
      calls.push(structuredClone(update));
      if (rejectUpdate) throw new Error('simulated Chrome rule failure');
      const removed = new Set(update.removeRuleIds);
      const candidate = rules.filter((rule) => !removed.has(rule.id));
      candidate.push(...structuredClone(update.addRules));
      if (new Set(candidate.map((rule) => rule.id)).size !== candidate.length) throw new Error('duplicate rule id');
      rules = candidate;
    }
  };
  return { manager: createRuleManager({ declarativeNetRequest, storage }), values, calls, get rules() { return rules; } };
}

test('saves normalized domains and applies only its own rules, preserving unrelated dynamic rules', async () => {
  const h = harness();
  await h.manager.saveConfiguredDomains(['Example.com', 'sub.example.org']);
  const result = await h.manager.applyConfiguredRules();
  assert.deepEqual(h.values[BLOCKLIST_STORAGE_KEY], ['example.com', 'sub.example.org']);
  assert.equal(result.applied, true);
  assert.deepEqual(h.rules.map(({ id }) => id), [50, 1000, 1001]);
  assert.deepEqual(h.calls[0].removeRuleIds, []);
});

test('updates and removes only KidsGuard-owned dynamic rules', async () => {
  const h = harness();
  await h.manager.saveConfiguredDomains(['one.example', 'two.example']);
  await h.manager.applyConfiguredRules();
  await h.manager.removeDomain('one.example');
  const status = await h.manager.applyConfiguredRules();
  assert.deepEqual(status.configuredDomains, ['two.example']);
  assert.equal(status.applied, true);
  assert.deepEqual(h.rules.map(({ id }) => id), [50, 1000]);
  assert.deepEqual(h.calls[1].removeRuleIds, [1000, 1001]);
});

test('reports unapplied rules when Chrome rejects atomic dynamic rule update', async () => {
  const h = harness({ rejectUpdate: true });
  await h.manager.saveConfiguredDomains(['example.com']);
  await assert.rejects(h.manager.applyConfiguredRules(), /simulated Chrome rule failure/u);
  assert.deepEqual(h.rules.map(({ id }) => id), [50]);
  assert.equal((await h.manager.getStatus()).applied, false);
});

test('keeps the configured list visible when Chrome cannot read its active rules', async () => {
  const h = harness({ rejectRead: true });
  await h.manager.saveConfiguredDomains(['example.com']);
  const status = await h.manager.getStatus();
  assert.deepEqual(status.configuredDomains, ['example.com']);
  assert.equal(status.applied, false);
  assert.match(status.error, /could not be read/u);
});

test('does not update Chrome rules for an unchanged configured list', async () => {
  const h = harness();
  await h.manager.saveConfiguredDomains(['example.com']);
  await h.manager.applyConfiguredRules();
  await h.manager.applyConfiguredRules();
  assert.equal(h.calls.length, 1);
});

test('clears only owned rules and validates storage before creating rules', async () => {
  const h = harness();
  await h.manager.saveConfiguredDomains(['example.com']);
  await h.manager.applyConfiguredRules();
  await h.manager.clearManagedRules();
  assert.deepEqual(h.rules.map(({ id }) => id), [50]);
  h.values[BLOCKLIST_STORAGE_KEY] = ['bad/path'];
  await assert.rejects(h.manager.applyConfiguredRules(), { name: 'TypeError' });
});

test('syncParentPolicy applies parent blocked domains when web restrictions are enabled', async () => {
  const h = harness();
  const policy = {
    version: 2,
    webRestrictions: {
      enabled: true,
      blockedDomains: ['Gambling.Example', 'Gaming.Example'],
    },
  };
  const result = await h.manager.syncParentPolicy(policy);
  assert.equal(result.applied, true);
  assert.deepEqual(result.configuredDomains, ['gambling.example', 'gaming.example']);
  assert.deepEqual(h.rules.map(({ id }) => id), [50, 1000, 1001]);
});

test('syncParentPolicy clears rules when web restrictions are disabled', async () => {
  const h = harness();
  // First apply some rules
  await h.manager.saveConfiguredDomains(['example.com']);
  await h.manager.applyConfiguredRules();
  assert.deepEqual(h.rules.map(({ id }) => id), [50, 1000]);

  // Now sync disabled policy
  const policy = {
    version: 3,
    webRestrictions: {
      enabled: false,
      blockedDomains: ['example.com'],
    },
  };
  const result = await h.manager.syncParentPolicy(policy);
  assert.equal(result.applied, true);
  assert.deepEqual(result.configuredDomains, []);
  assert.deepEqual(h.rules.map(({ id }) => id), [50]);
});
