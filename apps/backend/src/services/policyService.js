import { mongoPolicyRepository } from './policyRepository.js';
import { mongoFamilyChildRepository } from './familyChildRepository.js';
import { mongoDevicePairingRepository } from './devicePairingRepository.js';
import { childProfileNotFoundError } from './familyChildErrors.js';

function publicPolicy(policy, childProfileId) {
  if (!policy) {
    return {
      childProfileId: childProfileId.toString(),
      version: 1,
      screenTime: {
        dailyLimitMinutes: null,
        quietHours: {
          enabled: false,
          start: '21:00',
          end: '07:00',
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        },
      },
      webRestrictions: {
        enabled: false,
        enforcementPlatform: 'desktop_chrome',
        blockedDomains: [],
      },
      updatedAt: null,
    };
  }

  return {
    childProfileId: (policy.childProfileId ?? childProfileId).toString(),
    version: policy.version ?? 1,
    screenTime: {
      dailyLimitMinutes: policy.screenTime?.dailyLimitMinutes ?? null,
      quietHours: {
        enabled: policy.screenTime?.quietHours?.enabled ?? false,
        start: policy.screenTime?.quietHours?.start ?? '21:00',
        end: policy.screenTime?.quietHours?.end ?? '07:00',
        days: policy.screenTime?.quietHours?.days ?? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
    },
    webRestrictions: {
      enabled: policy.webRestrictions?.enabled ?? false,
      enforcementPlatform: policy.webRestrictions?.enforcementPlatform ?? 'desktop_chrome',
      blockedDomains: policy.webRestrictions?.blockedDomains ?? [],
    },
    updatedAt: policy.updatedAt ?? null,
  };
}

export function createPolicyService({
  repository = mongoPolicyRepository,
  familyChildRepository = mongoFamilyChildRepository,
  devicePairingRepository = mongoDevicePairingRepository,
  now = () => new Date(),
} = {}) {
  async function resolveFamilyAndChild(parentId, childId) {
    repository.assertAvailable?.();
    familyChildRepository.assertAvailable?.();
    const family = await familyChildRepository.findFamilyForParent(parentId);
    const familyId = family?._id?.toString() ?? family?.id?.toString();
    if (!familyId) return null;

    const child = await familyChildRepository.findChildInFamily(childId, familyId);
    if (!child) return null;

    return { familyId, childId };
  }

  return Object.freeze({
    async getPolicy(parentId, childId) {
      const scope = await resolveFamilyAndChild(parentId, childId);
      if (!scope) throw childProfileNotFoundError();

      const policy = await repository.findPolicyByChildId(scope.familyId, scope.childId);
      return publicPolicy(policy, scope.childId);
    },

    async updatePolicy(parentId, childId, updates) {
      const scope = await resolveFamilyAndChild(parentId, childId);
      if (!scope) throw childProfileNotFoundError();

      const saved = await repository.savePolicy(scope.familyId, scope.childId, updates);
      return publicPolicy(saved, scope.childId);
    },

    async getDevicePolicy(device) {
      repository.assertAvailable?.();
      const policy = await repository.findPolicyByChildId(device.familyId, device.childProfileId);
      const pub = publicPolicy(policy, device.childProfileId);

      return {
        policyVersion: pub.version,
        policy: {
          screenTime: pub.screenTime,
          webRestrictions: pub.webRestrictions,
        },
      };
    },

    async acknowledgeDevicePolicy(device, acknowledgedVersion) {
      repository.assertAvailable?.();
      devicePairingRepository.assertAvailable?.();

      const currentPolicy = await repository.findPolicyByChildId(device.familyId, device.childProfileId);
      const currentVersion = currentPolicy?.version ?? 1;

      // Bound acknowledged version to current policy version
      const safeVersion = Math.min(acknowledgedVersion, currentVersion);
      const ackTimestamp = now();

      if (devicePairingRepository.acknowledgePolicy) {
        await devicePairingRepository.acknowledgePolicy({
          deviceId: device.id,
          acknowledgedVersion: safeVersion,
          lastPolicyAckAt: ackTimestamp,
        });
      }

      return {
        acknowledgedVersion: safeVersion,
        syncedAt: ackTimestamp,
      };
    },
  });
}

export const policyService = createPolicyService();
