import { randomBytes } from 'node:crypto';

function createId() {
  return randomBytes(12).toString('hex');
}

function copy(record) {
  return record ? JSON.parse(JSON.stringify(record)) : null;
}

export function createMemoryPolicyRepository() {
  const policiesByChildId = new Map();

  return {
    assertAvailable() {},

    async findPolicyByChildId(familyId, childProfileId) {
      const policy = policiesByChildId.get(childProfileId.toString());
      if (!policy || policy.familyId !== familyId.toString()) return null;
      return copy(policy);
    },

    async savePolicy(familyId, childProfileId, policyData) {
      const key = childProfileId.toString();
      let existing = policiesByChildId.get(key);

      if (!existing) {
        existing = {
          _id: createId(),
          familyId: familyId.toString(),
          childProfileId: key,
          version: 1,
          screenTime: {
            dailyLimitMinutes: policyData.screenTime?.dailyLimitMinutes ?? null,
            quietHours: {
              enabled: policyData.screenTime?.quietHours?.enabled ?? false,
              start: policyData.screenTime?.quietHours?.start ?? '21:00',
              end: policyData.screenTime?.quietHours?.end ?? '07:00',
              days: policyData.screenTime?.quietHours?.days ?? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            },
          },
          webRestrictions: {
            enabled: policyData.webRestrictions?.enabled ?? false,
            enforcementPlatform: 'desktop_chrome',
            blockedDomains: policyData.webRestrictions?.blockedDomains ?? [],
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        policiesByChildId.set(key, existing);
        return copy(existing);
      }

      const updated = {
        ...existing,
        version: existing.version + 1,
        screenTime: {
          ...existing.screenTime,
          ...(policyData.screenTime || {}),
          quietHours: {
            ...existing.screenTime?.quietHours,
            ...(policyData.screenTime?.quietHours || {}),
          },
        },
        webRestrictions: {
          ...existing.webRestrictions,
          ...(policyData.webRestrictions || {}),
        },
        updatedAt: new Date(),
      };
      policiesByChildId.set(key, updated);
      return copy(updated);
    },

    clear() {
      policiesByChildId.clear();
    },
  };
}
