import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { ensureAuthIndexes } from './services/authRepository.js';
import { ensureFamilyChildIndexes } from './services/familyChildRepository.js';
import { ensureDevicePairingIndexes } from './services/devicePairingRepository.js';
import { ensurePolicyIndexes } from './services/policyRepository.js';
import { ensureScreenTimeIndexes } from './services/screenTimeRepository.js';
import { ensureWebHistoryIndexes } from './services/webHistoryRepository.js';

const SHUTDOWN_TIMEOUT_MS = 5_000;

export async function startServer() {
  try {
    const connected = await connectDatabase(env.MONGODB_URI);
    if (!connected) {
      console.warn('MONGODB_URI is not configured; database-backed features are unavailable.');
    } else {
      try {
        await ensureAuthIndexes();
      } catch {
        console.warn('Authentication storage could not be initialized; authentication is unavailable.');
      }
      try {
        await ensureFamilyChildIndexes();
      } catch {
        console.warn('Family and child storage could not be initialized; child profiles are unavailable.');
      }
      try {
        await ensureDevicePairingIndexes();
      } catch {
        console.warn('Device pairing storage could not be initialized; pairing is unavailable.');
      }
      try {
        await ensurePolicyIndexes();
      } catch {
        console.warn('Policy storage could not be initialized; policies are unavailable.');
      }
      try {
        await ensureScreenTimeIndexes();
      } catch {
        console.warn('Screen time storage could not be initialized; screen time is unavailable.');
      }
      try {
        await ensureWebHistoryIndexes();
      } catch {
        console.warn('Web history storage could not be initialized; web history is unavailable.');
      }
    }
  } catch (error) {
    console.warn(`${error.message} Starting API in degraded mode.`);
  }

  return app.listen(env.PORT, '0.0.0.0', () => {
    console.info(`KidsGuard API listening on port ${env.PORT}.`);
  });
}

async function shutdown(signal, server) {
  console.info(`${signal} received; shutting down KidsGuard API.`);
  if (server) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => server.closeAllConnections(), SHUTDOWN_TIMEOUT_MS);
      server.close((error) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      });
    });
  }
  await disconnectDatabase();
}

const isEntryPoint = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isEntryPoint) {
  const server = await startServer();
  process.once('SIGINT', () => void shutdown('SIGINT', server));
  process.once('SIGTERM', () => void shutdown('SIGTERM', server));
}
