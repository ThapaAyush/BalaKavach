import mongoose from 'mongoose';
import ScreenTimeSummary from '../models/ScreenTimeSummary.js';
import { ScreenTimeStorageUnavailableError } from './screenTimeErrors.js';

const DATABASE_OPERATION_TIMEOUT_MS = 10_000;
const TRANSIENT_MONGO_ERROR_CODES = new Set([6, 7, 89, 91, 11_600, 11_602, 13_435, 13_436]);
let screenTimeIndexesReady = false;

function isMongoUnavailableError(error) {
  return error?.name === 'MongooseServerSelectionError'
    || error?.name === 'MongoServerSelectionError'
    || error?.name === 'MongoServerClosedError'
    || /^MongoNetwork/.test(error?.name ?? '')
    || TRANSIENT_MONGO_ERROR_CODES.has(error?.code);
}

function assertDatabaseAvailable(requireIndexes = false) {
  if (mongoose.connection.readyState !== 1) {
    throw new ScreenTimeStorageUnavailableError();
  }
  if (requireIndexes && !screenTimeIndexesReady) {
    ensureScreenTimeIndexes().catch(() => {});
  }
}

async function runWithTimeout(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ScreenTimeStorageUnavailableError()), DATABASE_OPERATION_TIMEOUT_MS);
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
    if (error instanceof ScreenTimeStorageUnavailableError) throw error;
    if (mongoose.connection.readyState !== 1 || isMongoUnavailableError(error)) {
      throw new ScreenTimeStorageUnavailableError();
    }
    throw error;
  }
}

export async function ensureScreenTimeIndexes() {
  assertDatabaseAvailable(false);
  try {
    await runWithTimeout(() => ScreenTimeSummary.createIndexes());
    screenTimeIndexesReady = true;
  } catch {
    screenTimeIndexesReady = true;
  }
}

export const mongoScreenTimeRepository = Object.freeze({
  assertAvailable() {
    assertDatabaseAvailable(false);
  },

  async recordScreenTime(data) {
    return runDatabaseOperation(async () => {
      const updated = await ScreenTimeSummary.findOneAndUpdate(
        { deviceId: data.deviceId, date: data.date },
        {
          $set: {
            familyId: data.familyId,
            childProfileId: data.childProfileId,
            totalScreenTimeSeconds: data.totalScreenTimeSeconds,
            deviceUnlockCount: data.deviceUnlockCount ?? 0,
            reportingPeriod: data.reportingPeriod,
            permissionGranted: data.permissionGranted,
            source: data.source,
            appUsage: data.appUsage ?? [],
            reportedAt: data.reportedAt,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean().exec();
      return updated;
    });
  },

  async findSummariesByChildAndDate(familyId, childProfileId, date) {
    return runDatabaseOperation(() => ScreenTimeSummary.find({ familyId, childProfileId, date })
      .populate('deviceId', 'name platform')
      .lean()
      .exec());
  },

  async findRecentSummariesByChild(familyId, childProfileId, limit = 7) {
    return runDatabaseOperation(() => ScreenTimeSummary.find({ familyId, childProfileId })
      .sort({ date: -1 })
      .limit(limit)
      .lean()
      .exec());
  },
});
