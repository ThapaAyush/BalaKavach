import { randomBytes } from 'node:crypto';

function createId() {
  return randomBytes(12).toString('hex');
}

function copy(record) {
  return record ? { ...record } : null;
}

export function createMemoryDevicePairingRepository() {
  const pairingCodesByHash = new Map();
  const devicesById = new Map();
  let nextDeviceCreateError = null;

  return {
    assertAvailable() {},

    async createPairingCode(input) {
      const record = {
        _id: createId(),
        ...input,
        redeemedAt: null,
        revokedAt: null,
      };
      pairingCodesByHash.set(record.codeHash, record);
      return { id: record._id, expiresAt: record.expiresAt };
    },

    async revokePairingCode({ pairingCodeId, childProfileId, familyId, revokedAt }) {
      const pairing = [...pairingCodesByHash.values()].find((candidate) => candidate._id === pairingCodeId);
      if (!pairing
        || pairing.childProfileId !== childProfileId
        || pairing.familyId !== familyId
        || pairing.redeemedAt
        || pairing.revokedAt) return false;
      pairing.revokedAt = revokedAt;
      return true;
    },

    async redeemPairingCode({ codeHash, now, device }) {
      const pairing = pairingCodesByHash.get(codeHash);
      if (!pairing
        || pairing.expiresAt <= now
        || pairing.redeemedAt
        || pairing.revokedAt) return null;

      // The check and claim are synchronous so concurrent callers model the DB's atomic conditional update.
      pairing.redeemedAt = now;
      if (nextDeviceCreateError) {
        const error = nextDeviceCreateError;
        nextDeviceCreateError = null;
        throw error;
      }
      const record = {
        _id: createId(),
        familyId: pairing.familyId,
        childProfileId: pairing.childProfileId,
        pairingCodeId: pairing._id,
        lastSeenAt: null,
        revokedAt: null,
        ...device,
      };
      devicesById.set(record._id, record);
      return copy(record);
    },

    async listDevices(familyId) {
      return [...devicesById.values()]
        .filter((device) => device.familyId === familyId)
        .sort((a, b) => b.pairedAt.getTime() - a.pairedAt.getTime() || a._id.localeCompare(b._id))
        .map(copy);
    },

    async revokeDevice({ deviceId, familyId, revokedAt }) {
      const device = devicesById.get(deviceId);
      if (!device || device.familyId !== familyId || device.revokedAt) return false;
      device.revokedAt = revokedAt;
      return true;
    },

    getPairingCodeByHash(codeHash) {
      return copy(pairingCodesByHash.get(codeHash));
    },

    getDeviceById(deviceId) {
      return copy(devicesById.get(deviceId));
    },

    pairingCodeCount() {
      return pairingCodesByHash.size;
    },

    deviceCount() {
      return devicesById.size;
    },

    failNextDeviceCreate(error) {
      nextDeviceCreateError = error;
    },

    clear() {
      pairingCodesByHash.clear();
      devicesById.clear();
    },
  };
}
