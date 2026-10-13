import mongoose from 'mongoose';
import ChildProfile from '../models/ChildProfile.js';
import Family from '../models/Family.js';
import { FamilyChildStorageUnavailableError } from './familyChildErrors.js';

const DATABASE_OPERATION_TIMEOUT_MS = 10_000;
const TRANSIENT_MONGO_ERROR_CODES = new Set([6, 7, 89, 91, 11_600, 11_602, 13_435, 13_436]);
let familyChildIndexesReady = false;

function isMongoUnavailableError(error) {
  return error?.name === 'MongooseServerSelectionError'
    || error?.name === 'MongoServerSelectionError'
    || error?.name === 'MongoServerClosedError'
    || /^MongoNetwork/.test(error?.name ?? '')
    || TRANSIENT_MONGO_ERROR_CODES.has(error?.code);
}

function assertDatabaseAvailable(requireIndexes = true) {
  if (mongoose.connection.readyState !== 1 || (requireIndexes && !familyChildIndexesReady)) {
    throw new FamilyChildStorageUnavailableError();
  }
}

async function runWithTimeout(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new FamilyChildStorageUnavailableError()), DATABASE_OPERATION_TIMEOUT_MS);
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
    if (error instanceof FamilyChildStorageUnavailableError) throw error;
    if (mongoose.connection.readyState !== 1 || isMongoUnavailableError(error)) {
      throw new FamilyChildStorageUnavailableError();
    }
    throw error;
  }
}

function objectIdString(value) {
  return value?._id?.toString() ?? value?.toString();
}

export async function upsertFamilyWithDuplicateRecovery(upsert, findExisting) {
  try {
    return await upsert();
  } catch (error) {
    const isOwnerParentDuplicate = error?.code === 11000
      && (Object.hasOwn(error.keyPattern ?? {}, 'ownerParentId')
        || Object.hasOwn(error.keyValue ?? {}, 'ownerParentId'));
    if (!isOwnerParentDuplicate) throw error;
    const existing = await findExisting();
    if (!existing) throw error;
    return existing;
  }
}

export async function ensureFamilyChildIndexes() {
  assertDatabaseAvailable(false);
  await runWithTimeout(() => Promise.all([
    Family.createIndexes(),
    ChildProfile.createIndexes(),
  ]));
  familyChildIndexesReady = true;
}

export const mongoFamilyChildRepository = Object.freeze({
  assertAvailable() {
    assertDatabaseAvailable();
  },

  findFamilyForParent(ownerParentId) {
    return runDatabaseOperation(() => Family.findOne({ ownerParentId })
      .select('_id ownerParentId')
      .lean()
      .exec());
  },

  getOrCreateFamilyForParent(ownerParentId) {
    return runDatabaseOperation(() => upsertFamilyWithDuplicateRecovery(
      () => Family.findOneAndUpdate(
        { ownerParentId },
        { $setOnInsert: { ownerParentId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).select('_id ownerParentId').lean().exec(),
      () => Family.findOne({ ownerParentId }).select('_id ownerParentId').lean().exec(),
    ));
  },

  listChildren(familyId) {
    return runDatabaseOperation(() => ChildProfile.find({ familyId })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
      .exec());
  },

  createChildProfile({ familyId, displayName, dateOfBirth }) {
    return runDatabaseOperation(async () => {
      const child = await ChildProfile.create({ familyId, displayName, dateOfBirth });
      return child.toObject();
    });
  },

  findChildInFamily(childId, familyId) {
    return runDatabaseOperation(() => ChildProfile.findOne({ _id: childId, familyId })
      .lean()
      .exec());
  },

  updateChildInFamily(childId, familyId, updates) {
    return runDatabaseOperation(() => ChildProfile.findOneAndUpdate(
      { _id: childId, familyId },
      { $set: updates },
      { new: true, runValidators: true },
    ).lean().exec());
  },

  async deleteChildInFamily(childId, familyId) {
    const result = await runDatabaseOperation(() => ChildProfile.deleteOne({ _id: childId, familyId }).exec());
    return result.deletedCount === 1;
  },
});

export { objectIdString };
