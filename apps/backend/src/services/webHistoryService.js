import { mongoWebHistoryRepository } from './webHistoryRepository.js';
import { mongoFamilyChildRepository } from './familyChildRepository.js';
import { mongoDevicePairingRepository } from './devicePairingRepository.js';
import { childProfileNotFoundError } from './familyChildErrors.js';

export function createWebHistoryService({
  repository = mongoWebHistoryRepository,
  familyChildRepository = mongoFamilyChildRepository,
  devicePairingRepository = mongoDevicePairingRepository,
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
    async ingestDeviceWebHistory(device, visits) {
      repository.assertAvailable?.();
      devicePairingRepository.assertAvailable?.();

      if (!device?.familyId || !device?.childProfileId) {
        throw new Error('Device registration is missing family or child scope.');
      }

      const result = await repository.saveVisits(
        device.familyId,
        device.childProfileId,
        device.id,
        device.deviceName,
        visits
      );

      return {
        ok: true,
        ingestedCount: result.insertedCount,
      };
    },

    async getChildWebHistory(parentId, childId, query = {}) {
      const scope = await resolveFamilyAndChild(parentId, childId);
      if (!scope) throw childProfileNotFoundError();

      const result = await repository.findHistoryByChild(scope.familyId, scope.childId, query);
      return {
        ok: true,
        ...result,
      };
    },

    async getChildWebHistorySummary(parentId, childId, query = {}) {
      const scope = await resolveFamilyAndChild(parentId, childId);
      if (!scope) throw childProfileNotFoundError();

      const summary = await repository.getSummary(scope.familyId, scope.childId, query);
      return {
        ok: true,
        ...summary,
      };
    },
  });
}

export const webHistoryService = createWebHistoryService();
