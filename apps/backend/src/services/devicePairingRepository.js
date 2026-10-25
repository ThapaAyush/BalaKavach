import mongoose from 'mongoose';
import ChildProfile from '../models/ChildProfile.js';
import DeviceRegistration from '../models/DeviceRegistration.js';
import PairingCode from '../models/PairingCode.js';
import { DevicePairingStorageUnavailableError } from './devicePairingErrors.js';

const DATABASE_OPERATION_TIMEOUT_MS = 10_000;
const TRANSIENT_MONGO_ERROR_CODES = new Set([6, 7, 89, 91, 11_600, 11_602, 13_435, 13_436]);
let devicePairingIndexesReady = false;

function isMongoUnavailableError(error) {
  return error?.name === 'MongooseServerSelectionError'
    || error?.name === 'MongoServerSelectionError'
    || error?.name === 'MongoServerClosedError'
    || /^MongoNetwork/.test(error?.name ?? '')
    || TRANSIENT_MONGO_ERROR_CODES.has(error?.code);
}

function assertDatabaseAvailable(requireIndexes = false) {
  if (mongoose.connection.readyState !== 1) {
    throw new DevicePairingStorageUnavailableError();
  }
  if (requireIndexes && !devicePairingIndexesReady) {
    ensureDevicePairingIndexes().catch(() => {});
  }
}

async function runWithTimeout(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new DevicePairingStorageUnavailableError()), DATABASE_OPERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runDatabaseOperation(operation) {
  assertDatabaseAvailable();
  try {
    return await runWithTimeout(operation);
  } catch (error) {
    if (error instanceof DevicePairingStorageUnavailableError) throw error;
    if (mongoose.connection.readyState !== 1 || isMongoUnavailableError(error)) {
      throw new DevicePairingStorageUnavailableError();
    }
    throw error;
  }
}

export async function ensureDevicePairingIndexes() {
  assertDatabaseAvailable(false);
  try {
    await runWithTimeout(() => Promise.all([
      PairingCode.createIndexes(),
      DeviceRegistration.createIndexes(),
    ]));
    devicePairingIndexesReady = true;
  } catch {
    devicePairingIndexesReady = true;
  }
}

export const mongoDevicePairingRepository = Object.freeze({
  assertAvailable() {
    assertDatabaseAvailable(false);
  },

  async createPairingCode({ codeHash, familyId, childProfileId, createdByParentId, expiresAt }) {
    return runDatabaseOperation(async () => {
      const record = await PairingCode.create({
        codeHash,
        familyId,
        childProfileId,
        createdByParentId,
        expiresAt,
      });
      return { id: record._id.toString(), expiresAt: record.expiresAt };
    });
  },

  revokePairingCode({ pairingCodeId, childProfileId, familyId, revokedAt }) {
    return runDatabaseOperation(async () => {
      const result = await PairingCode.updateOne({
        _id: pairingCodeId,
        childProfileId,
        familyId,
        redeemedAt: null,
        revokedAt: null,
      }, { $set: { revokedAt } }).exec();
      return result.matchedCount === 1;
    });
  },

  redeemPairingCode({ codeHash, now, device }) {
    return runDatabaseOperation(async () => {
      const pairingCode = await PairingCode.findOneAndUpdate({
        codeHash,
        expiresAt: { $gt: now },
        redeemedAt: null,
        revokedAt: null,
      }, { $set: { redeemedAt: now } }, {
        new: true,
      }).select('_id familyId childProfileId').lean().exec();

      if (!pairingCode) return null;

      const childExists = await ChildProfile.exists({
        _id: pairingCode.childProfileId,
        familyId: pairingCode.familyId,
      }).exec();
      if (!childExists) return null;

      const created = await DeviceRegistration.create({
        ...device,
        familyId: pairingCode.familyId,
        childProfileId: pairingCode.childProfileId,
        pairingCodeId: pairingCode._id,
      });
      return created.toObject();
    });
  },

  listDevices(familyId) {
    return runDatabaseOperation(() => DeviceRegistration.find({ familyId })
      .select('_id childProfileId name platform pairedAt lastSeenAt revokedAt uninstalledAt acknowledgedPolicyVersion lastPolicyAckAt lastScreenTimeReportAt')
      .sort({ pairedAt: -1, _id: 1 })
      .lean()
      .exec());
  },

  revokeDevice({ deviceId, familyId, revokedAt }) {
    return runDatabaseOperation(async () => {
      const result = await DeviceRegistration.updateOne({
        _id: deviceId,
        familyId,
        revokedAt: null,
      }, { $set: { revokedAt } }).exec();
      return result.matchedCount === 1;
    });
  },

  recordDeviceUninstall({ deviceId, uninstalledAt }) {
    return runDatabaseOperation(async () => {
      const result = await DeviceRegistration.findOneAndUpdate(
        { _id: deviceId },
        { $set: { uninstalledAt } },
        {
          new: true,
          select: '_id childProfileId name platform pairedAt lastSeenAt revokedAt uninstalledAt acknowledgedPolicyVersion lastPolicyAckAt lastScreenTimeReportAt',
        },
      ).lean().exec();
      return result;
    });
  },

  findDeviceByCredentialHash(credentialHash) {
    if (typeof credentialHash !== 'string' || !/^[0-9a-f]{64}$/.test(credentialHash)) {
      return null;
    }
    return runDatabaseOperation(async () => {
      const device = await DeviceRegistration.findOne({ credentialHash })
        .select('_id familyId childProfileId name platform pairedAt lastSeenAt revokedAt acknowledgedPolicyVersion lastPolicyAckAt lastScreenTimeReportAt')
        .lean()
        .exec();
      return device;
    });
  },

  recordHeartbeat({ deviceId, lastSeenAt }) {
    return runDatabaseOperation(async () => {
      const updated = await DeviceRegistration.findOneAndUpdate(
        {
          _id: deviceId,
          revokedAt: null,
        },
        {
          $set: { lastSeenAt },
        },
        {
          new: true,
          select: '_id childProfileId name platform pairedAt lastSeenAt revokedAt acknowledgedPolicyVersion lastPolicyAckAt lastScreenTimeReportAt',
        },
      ).lean().exec();
      return updated;
    });
  },

  acknowledgePolicy({ deviceId, acknowledgedVersion, lastPolicyAckAt }) {
    return runDatabaseOperation(async () => {
      const updated = await DeviceRegistration.findOneAndUpdate(
        {
          _id: deviceId,
          revokedAt: null,
        },
        {
          $set: { acknowledgedPolicyVersion: acknowledgedVersion, lastPolicyAckAt },
        },
        {
          new: true,
        },
      ).lean().exec();
      return updated;
    });
  },

  recordScreenTimeReport({ deviceId, lastScreenTimeReportAt }) {
    return runDatabaseOperation(async () => {
      const updated = await DeviceRegistration.findOneAndUpdate(
        {
          _id: deviceId,
          revokedAt: null,
        },
        {
          $set: { lastScreenTimeReportAt },
        },
        {
          new: true,
        },
      ).lean().exec();
      return updated;
    });
  },
});
