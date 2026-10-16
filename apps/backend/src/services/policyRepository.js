import mongoose from 'mongoose';
import Policy from '../models/Policy.js';
import { PolicyStorageUnavailableError } from './policyErrors.js';

const DATABASE_OPERATION_TIMEOUT_MS = 10_000;
const TRANSIENT_MONGO_ERROR_CODES = new Set([6, 7, 89, 91, 11_600, 11_602, 13_435, 13_436]);
let policyIndexesReady = false;

function isMongoUnavailableError(error) {
  return error?.name === 'MongooseServerSelectionError'
    || error?.name === 'MongoServerSelectionError'
    || error?.name === 'MongoServerClosedError'
    || /^MongoNetwork/.test(error?.name ?? '')
    || TRANSIENT_MONGO_ERROR_CODES.has(error?.code);
}

function assertDatabaseAvailable(requireIndexes = true) {
  if (mongoose.connection.readyState !== 1 || (requireIndexes && !policyIndexesReady)) {
    throw new PolicyStorageUnavailableError();
  }
}

async function runWithTimeout(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new PolicyStorageUnavailableError()), DATABASE_OPERATION_TIMEOUT_MS);
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
    if (error instanceof PolicyStorageUnavailableError) throw error;
    if (mongoose.connection.readyState !== 1 || isMongoUnavailableError(error)) {
      throw new PolicyStorageUnavailableError();
    }
    throw error;
  }
}

export async function ensurePolicyIndexes() {
  assertDatabaseAvailable(false);
  await runWithTimeout(() => Policy.createIndexes());
  policyIndexesReady = true;
}

export const mongoPolicyRepository = Object.freeze({
  assertAvailable() {
    assertDatabaseAvailable();
  },

  async findPolicyByChildId(familyId, childProfileId) {
    return runDatabaseOperation(() => Policy.findOne({ familyId, childProfileId })
      .lean()
      .exec());
  },

  async savePolicy(familyId, childProfileId, policyData) {
    return runDatabaseOperation(async () => {
      const existing = await Policy.findOne({ familyId, childProfileId }).exec();
      if (!existing) {
        const created = await Policy.create({
          familyId,
          childProfileId,
          version: 1,
          screenTime: policyData.screenTime ?? {},
          webRestrictions: policyData.webRestrictions ?? {},
        });
        return created.toObject();
      }

      if (policyData.screenTime) {
        existing.screenTime = {
          ...existing.screenTime?.toObject?.() ?? existing.screenTime,
          ...policyData.screenTime,
        };
      }
      if (policyData.webRestrictions) {
        existing.webRestrictions = {
          ...existing.webRestrictions?.toObject?.() ?? existing.webRestrictions,
          ...policyData.webRestrictions,
        };
      }
      existing.version = (existing.version || 1) + 1;
      await existing.save();
      return existing.toObject();
    });
  },
});
