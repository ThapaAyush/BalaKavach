import { randomBytes } from 'node:crypto';

function createId() {
  return randomBytes(12).toString('hex');
}

function copyChild(child) {
  return child ? { ...child } : null;
}

export function createMemoryFamilyChildRepository() {
  const familiesByParentId = new Map();
  const childrenById = new Map();

  return {
    async findFamilyForParent(ownerParentId) {
      return familiesByParentId.get(ownerParentId) ?? null;
    },

    async getOrCreateFamilyForParent(ownerParentId) {
      let family = familiesByParentId.get(ownerParentId);
      if (!family) {
        family = { _id: createId(), ownerParentId };
        familiesByParentId.set(ownerParentId, family);
      }
      return family;
    },

    async listChildren(familyId) {
      return [...childrenById.values()]
        .filter((child) => child.familyId === familyId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a._id.localeCompare(b._id))
        .map(copyChild);
    },

    async createChildProfile({ familyId, displayName, dateOfBirth }) {
      const now = new Date();
      const child = {
        _id: createId(),
        familyId,
        displayName,
        dateOfBirth,
        createdAt: now,
        updatedAt: now,
      };
      childrenById.set(child._id, child);
      return copyChild(child);
    },

    async findChildInFamily(childId, familyId) {
      const child = childrenById.get(childId);
      return child?.familyId === familyId ? copyChild(child) : null;
    },

    async updateChildInFamily(childId, familyId, updates) {
      const child = childrenById.get(childId);
      if (!child || child.familyId !== familyId) return null;
      Object.assign(child, updates, { updatedAt: new Date() });
      return copyChild(child);
    },

    async deleteChildInFamily(childId, familyId) {
      const child = childrenById.get(childId);
      if (!child || child.familyId !== familyId) return false;
      childrenById.delete(childId);
      return true;
    },

    clear() {
      familiesByParentId.clear();
      childrenById.clear();
    },

    getFamilyForParent(ownerParentId) {
      return familiesByParentId.get(ownerParentId) ?? null;
    },
  };
}
