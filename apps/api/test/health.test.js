import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { getMongoConnectionStatus } from '../src/controllers/healthController.js';

const OPERATION_TIMEOUT_MS = 5_000;
let server;

function withTimeout(operation, label) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${OPERATION_TIMEOUT_MS}ms`)), OPERATION_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await withTimeout(once(server, 'listening'), 'HTTP test server startup');
});

after(async () => {
  if (server?.listening) {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server.closeAllConnections();
    await withTimeout(closed, 'HTTP test server cleanup');
  }

  await withTimeout(disconnectDatabase(), 'MongoDB test cleanup');
});

describe('GET /api/v1/health', () => {
  it('returns API liveness without claiming an unavailable database is ready', { timeout: 7_000 }, async () => {
    const response = await request(server)
      .get('/api/v1/health')
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.data.service, 'kidsguard-api');
    assert.equal(response.body.data.status, 'degraded');
    assert.equal(response.body.data.dependencies.mongodb, 'disconnected');
    assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/i);
    assert.equal(JSON.stringify(response.body).includes('mongodb+srv://'), false);
  });

  it('uses a generic not-found response for unimplemented routes', { timeout: 7_000 }, async () => {
    const response = await request(server)
      .get('/api/v1/not-implemented')
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(404);

    assert.equal(response.body.error.message, 'Route not found');
    assert.equal(JSON.stringify(response.body).includes('Error:'), false);
  });

  it('maps each Mongoose connection state accurately and only treats connected as ready', () => {
    assert.equal(getMongoConnectionStatus(0), 'disconnected');
    assert.equal(getMongoConnectionStatus(1), 'connected');
    assert.equal(getMongoConnectionStatus(2), 'connecting');
    assert.equal(getMongoConnectionStatus(3), 'disconnecting');
    assert.equal(getMongoConnectionStatus(99), 'unknown');
  });

  it('skips connection attempts when MONGODB_URI is not configured', async () => {
    assert.equal(await connectDatabase(undefined), false);
    assert.equal(mongoose.connection.readyState, 0);
  });

  it('returns a safe error and remains disconnected for an invalid MongoDB URI', async () => {
    await assert.rejects(
      connectDatabase('not-a-mongodb-uri'),
      /MongoDB connection failed\. Check MONGODB_URI and Atlas network access\./,
    );
    assert.notEqual(mongoose.connection.readyState, 1);
  });
});
