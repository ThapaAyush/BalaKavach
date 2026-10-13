import { mongoDevicePairingRepository } from './devicePairingRepository.js';
import { mongoFamilyChildRepository } from './familyChildRepository.js';
import { childProfileNotFoundError } from './familyChildErrors.js';
import {
  deviceNotFoundError,
  invalidPairingCodeError,
  pairingCodeNotFoundError,
} from './devicePairingErrors.js';
import {
  generateDeviceCredential,
  generatePairingCode,
  hashSecret,
  PAIRING_CODE_TTL_MS,
} from '../utils/pairingCredentials.js';

function idString(value) {
  return value?._id?.toString() ?? value?.id?.toString() ?? value?.toString();
}

function publicDevice(device) {
  return {
    id: idString(device),
    childProfileId: device.childProfileId?.toString(),
    name: device.name,
    platform: device.platform,
    pairingStatus: device.revokedAt ? 'revoked' : 'paired',
    pairedAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt ?? null,
    enforcementStatus: 'not_implemented',
    revokedAt: device.revokedAt ?? null,
  };
}

function requiredFamilyId(family) {
  const id = family?._id?.toString() ?? family?.id?.toString();
  return id ?? null;
}

export function createDevicePairingService({
  repository = mongoDevicePairingRepository,
  familyChildRepository = mongoFamilyChildRepository,
  now = () => new Date(),
  codeGenerator = generatePairingCode,
  credentialGenerator = generateDeviceCredential,
} = {}) {
  async function familyForParent(parentId) {
    repository.assertAvailable?.();
    familyChildRepository.assertAvailable?.();
    const family = await familyChildRepository.findFamilyForParent(parentId);
    const familyId = requiredFamilyId(family);
    return familyId ? { family, familyId } : null;
  }

  async function ownedChild(parentId, childId) {
    const ownedFamily = await familyForParent(parentId);
    if (!ownedFamily) return null;
    const child = await familyChildRepository.findChildInFamily(childId, ownedFamily.familyId);
    return child ? ownedFamily : null;
  }

  return Object.freeze({
    async createPairingCode(parentId, childId) {
      const ownedFamily = await ownedChild(parentId, childId);
      if (!ownedFamily) throw childProfileNotFoundError();

      const code = codeGenerator();
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + PAIRING_CODE_TTL_MS);
      const record = await repository.createPairingCode({
        codeHash: hashSecret(code),
        familyId: ownedFamily.familyId,
        childProfileId: childId,
        createdByParentId: parentId,
        expiresAt,
      });

      return { id: record.id, code, expiresAt: record.expiresAt };
    },

    async revokePairingCode(parentId, childId, pairingCodeId) {
      const ownedFamily = await ownedChild(parentId, childId);
      if (!ownedFamily) throw childProfileNotFoundError();

      const revoked = await repository.revokePairingCode({
        pairingCodeId,
        childProfileId: childId,
        familyId: ownedFamily.familyId,
        revokedAt: now(),
      });
      if (!revoked) throw pairingCodeNotFoundError();
    },

    async redeemPairingCode({ code, name, platform }) {
      const credential = credentialGenerator();
      const redeemedAt = now();
      const device = await repository.redeemPairingCode({
        codeHash: hashSecret(code),
        now: redeemedAt,
        device: {
          credentialHash: hashSecret(credential),
          name,
          platform,
          pairedAt: redeemedAt,
        },
      });
      if (!device) throw invalidPairingCodeError();
      return { device: publicDevice(device), deviceCredential: credential };
    },

    async listDevices(parentId) {
      const ownedFamily = await familyForParent(parentId);
      if (!ownedFamily) return [];
      const devices = await repository.listDevices(ownedFamily.familyId);
      return devices.map(publicDevice);
    },

    async revokeDevice(parentId, deviceId) {
      const ownedFamily = await familyForParent(parentId);
      if (!ownedFamily) throw deviceNotFoundError();
      const revoked = await repository.revokeDevice({
        deviceId,
        familyId: ownedFamily.familyId,
        revokedAt: now(),
      });
      if (!revoked) throw deviceNotFoundError();
    },
  });
}

export const devicePairingService = createDevicePairingService();
