import mongoose from 'mongoose';
import Parent from '../models/Parent.js';
import ParentSession from '../models/ParentSession.js';
import { AuthDatabaseUnavailableError } from './authErrors.js';

let authIndexesReady = false;

function assertDatabaseConnected() {
  if (mongoose.connection.readyState !== 1 || !authIndexesReady) {
    throw new AuthDatabaseUnavailableError();
  }
}

const TRANSIENT_MONGO_ERROR_CODES = new Set([6, 7, 89, 91, 11_600, 11_602, 13_435, 13_436]);

function isMongoUnavailableError(error) {
  return error?.name === 'MongooseServerSelectionError'
    || error?.name === 'MongoServerSelectionError'
    || error?.name === 'MongoServerClosedError'
    || /^MongoNetwork/.test(error?.name ?? '')
    || TRANSIENT_MONGO_ERROR_CODES.has(error?.code);
}

export function normalizeAuthRepositoryError(error, readyState = mongoose.connection.readyState) {
  if (error?.code !== 11000 && (readyState !== 1 || isMongoUnavailableError(error))) {
    return new AuthDatabaseUnavailableError();
  }
  return error;
}

async function runDatabaseOperation(operation) {
  assertDatabaseConnected();

  try {
    return await operation();
  } catch (error) {
    throw normalizeAuthRepositoryError(error);
  }
}

export async function ensureAuthIndexes() {
  if (mongoose.connection.readyState !== 1) throw new AuthDatabaseUnavailableError();
  await Promise.all([Parent.createIndexes(), ParentSession.createIndexes()]);
  authIndexesReady = true;
}

export const mongoAuthRepository = Object.freeze({
  assertAvailable() {
    assertDatabaseConnected();
  },

  createParent({ email, passwordHash }) {
    return runDatabaseOperation(async () => {
      const parent = await Parent.create({ email, passwordHash });
      return {
        id: parent._id.toString(),
        email: parent.email,
        passwordHash: parent.passwordHash,
      };
    });
  },

  findParentByEmail(email) {
    return runDatabaseOperation(() => Parent.findOne({ email })
      .select('+passwordHash')
      .lean()
      .exec());
  },

  createSession({ parentId, tokenHash, expiresAt }) {
    return runDatabaseOperation(() => ParentSession.create({ parentId, tokenHash, expiresAt }));
  },

  findActiveSession(tokenHash, now) {
    return runDatabaseOperation(async () => {
      const session = await ParentSession.findOne({
        tokenHash,
        expiresAt: { $gt: now },
      })
        .select('parentId expiresAt')
        .lean()
        .exec();

      if (!session) return null;

      const parent = await Parent.findById(session.parentId)
        .select('_id email')
        .lean()
        .exec();

      return parent ? { parent } : null;
    });
  },

  deleteSession(tokenHash) {
    return runDatabaseOperation(() => ParentSession.deleteOne({ tokenHash }).exec());
  },
});
