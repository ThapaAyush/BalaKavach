import mongoose from 'mongoose';

const DATABASE_OPERATION_TIMEOUT_MS = 5_000;

function withTimeout(operation, message) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), DATABASE_OPERATION_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function connectDatabase(uri) {
  if (!uri) return false;

  try {
    await withTimeout(
      mongoose.connect(uri, { serverSelectionTimeoutMS: DATABASE_OPERATION_TIMEOUT_MS }),
      'MongoDB connection timed out.',
    );
    return true;
  } catch {
    throw new Error('MongoDB connection failed. Check MONGODB_URI and Atlas network access.');
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await withTimeout(mongoose.disconnect(), 'MongoDB disconnect timed out.');
  }
}
