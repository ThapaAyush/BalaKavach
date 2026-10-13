import { mongoFamilyChildRepository, objectIdString } from './familyChildRepository.js';
import {
  childProfileNotFoundError,
  FamilyChildStorageUnavailableError,
} from './familyChildErrors.js';

function publicChild(child) {
  return {
    id: objectIdString(child),
    displayName: child.displayName,
    dateOfBirth: child.dateOfBirth ?? null,
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
  };
}

function familyId(family) {
  const id = family?._id?.toString() ?? family?.id?.toString();
  if (!id) throw new FamilyChildStorageUnavailableError();
  return id;
}

export function createFamilyChildService({ repository = mongoFamilyChildRepository } = {}) {
  return Object.freeze({
    async listChildren(parentId) {
      repository.assertAvailable?.();
      const family = await repository.findFamilyForParent(parentId);
      if (!family) return [];
      const children = await repository.listChildren(familyId(family));
      return children.map(publicChild);
    },

    async createChild(parentId, input) {
      repository.assertAvailable?.();
      const family = await repository.getOrCreateFamilyForParent(parentId);
      const child = await repository.createChildProfile({
        familyId: familyId(family),
        displayName: input.displayName,
        dateOfBirth: input.dateOfBirth ?? null,
      });
      return publicChild(child);
    },

    async getChild(parentId, childId) {
      repository.assertAvailable?.();
      const family = await repository.findFamilyForParent(parentId);
      if (!family) throw childProfileNotFoundError();
      const child = await repository.findChildInFamily(childId, familyId(family));
      if (!child) throw childProfileNotFoundError();
      return publicChild(child);
    },

    async updateChild(parentId, childId, updates) {
      repository.assertAvailable?.();
      const family = await repository.findFamilyForParent(parentId);
      if (!family) throw childProfileNotFoundError();
      const child = await repository.updateChildInFamily(childId, familyId(family), updates);
      if (!child) throw childProfileNotFoundError();
      return publicChild(child);
    },

    async deleteChild(parentId, childId) {
      repository.assertAvailable?.();
      const family = await repository.findFamilyForParent(parentId);
      if (!family) throw childProfileNotFoundError();
      const deleted = await repository.deleteChildInFamily(childId, familyId(family));
      if (!deleted) throw childProfileNotFoundError();
    },
  });
}

export const familyChildService = createFamilyChildService();
