import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import app from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { ensureAuthIndexes } from './services/authRepository.js';

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
    }
  } catch (error) {
    console.warn(`${error.message} Starting API in degraded mode.`);
  }

  return app.listen(env.PORT, () => {
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
