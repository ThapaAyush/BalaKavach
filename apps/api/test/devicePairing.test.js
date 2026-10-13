import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import DeviceRegistration from '../src/models/DeviceRegistration.js';
import PairingCode from '../src/models/PairingCode.js';
import {
  DevicePairingStorageUnavailableError,
} from '../src/services/devicePairingErrors.js';
import { devicePairingService as mongoDevicePairingService } from '../src/services/devicePairingService.js';
import { createDevicePairingService } from '../src/services/devicePairingService.js';
import { createFamilyChildService } from '../src/services/familyChildService.js';
import { hashSecret, generateDeviceCredential, generatePairingCode, PAIRING_CODE_TTL_MS } from '../src/utils/pairingCredentials.js';
import { createMemoryDevicePairingRepository } from '../test-support/memoryDevicePairingRepository.js';
import { createMemoryFamilyChildRepository } from '../test-support/memoryFamilyChildRepository.js';

const CLIENT_ORIGIN = 'http://localhost:5173';
const OPERATION_TIMEOUT_MS = 5_000;
const TOKEN_PARENT_ONE = 'a'.repeat(43);
const TOKEN_PARENT_TWO = 'b'.repeat(43);
const PARENT_ONE = { id: '64b000000000000000000001', email: 'one@example.com' };
const PARENT_TWO = { id: '64b000000000000000000002', email: 'two@example.com' };
const TEST_ENV = Object.freeze({ NODE_ENV: 'test', CLIENT_ORIGIN });
const REDEMPTION_INPUT = Object.freeze({ name: 'Kitchen tablet', platform: 'android' });

const cookieFor = (token) => `kidsguard_session=${token}`;

function authenticated(method, path, token = TOKEN_PARENT_ONE, origin = CLIENT_ORIGIN) {
  let req = request(context.app)
    [method](path)
    .set('Cookie', cookieFor(token))
    .timeout({ deadline: OPERATION_TIMEOUT_MS });
  if (origin !== null) req = req.set('Origin', origin);
  return req;
}

function createChild(displayName, token = TOKEN_PARENT_ONE) {
  return authenticated('post', '/api/v1/children', token)
    .send({ displayName })
    .expect(201);
}

function issueCode(childId, token = TOKEN_PARENT_ONE, origin = CLIENT_ORIGIN) {
  return authenticated('post', `/api/v1/children/${childId}/pairing-codes`, token, origin).send({});
}

function redeem(code, extra = {}) {
  return request(context.app)
    .post('/api/v1/device-pairing/redeem')
    .send({ code, ...REDEMPTION_INPUT, ...extra })
    .timeout({ deadline: OPERATION_TIMEOUT_MS });
}

let context;

beforeEach(() => {
  const familyChildRepository = createMemoryFamilyChildRepository();
  const repository = createMemoryDevicePairingRepository();
  const parentsByToken = new Map([
    [TOKEN_PARENT_ONE, PARENT_ONE],
    [TOKEN_PARENT_TWO, PARENT_TWO],
  ]);
  const authService = {
    async register() {},
    async login() {},
    async logout() {},
    async authenticate(token) { return parentsByToken.get(token) ?? null; },
  };
  let currentTime = new Date('2026-10-13T00:00:00.000Z');
  const devicePairingService = createDevicePairingService({
    repository,
    familyChildRepository,
    now: () => new Date(currentTime),
  });
  context = {
    familyChildRepository,
    repository,
    setNow(value) { currentTime = new Date(value); },
    app: createApp({
      authService,
      familyChildService: createFamilyChildService({ repository: familyChildRepository }),
      devicePairingService,
      runtimeEnv: TEST_ENV,
    }),
  };
});

afterEach(() => {
  context?.familyChildRepository.clear();
  context?.repository.clear();
});

describe('cryptographic pairing material', () => {
  it('generates high-entropy pairing codes and device credentials', () => {
    const codes = new Set(Array.from({ length: 64 }, () => generatePairingCode()));
    const code = [...codes][0];
    const credential = generateDeviceCredential();

    assert.equal(codes.size, 64);
    assert.match(code, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(Buffer.from(code, 'base64url').length, 16);
    assert.equal(hashSecret(code).length, 64);
    assert.notEqual(hashSecret(code), code);
    assert.match(credential, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(credential, 'base64url').length, 32);
  });
});

describe('authenticated child-device pairing', { concurrency: false }, () => {
  it('creates a scoped, expiring code and registers a device only after redemption', async () => {
    const child = (await createChild('Tablet child')).body.data.child;
    const issuedAt = new Date('2026-10-13T00:00:00.000Z');
    const issued = await issueCode(child.id).expect(201);
    const pairingCode = issued.body.data.pairingCode;
    const storedCode = context.repository.getPairingCodeByHash(hashSecret(pairingCode.code));

    assert.equal(issued.headers['cache-control'], 'no-store');
    assert.match(pairingCode.code, /^[A-Za-z0-9_-]{22}$/);
    assert.equal(Date.parse(pairingCode.expiresAt), issuedAt.getTime() + PAIRING_CODE_TTL_MS);
    assert.equal(storedCode.codeHash, hashSecret(pairingCode.code));
    assert.equal(Object.hasOwn(storedCode, 'code'), false);
    assert.equal(storedCode.childProfileId, child.id);
    assert.equal(storedCode.createdByParentId, PARENT_ONE.id);
    assert.equal(context.repository.deviceCount(), 0);

    const redeemed = await redeem(pairingCode.code).expect(201);
    const { device, deviceCredential } = redeemed.body.data;
    const storedDevice = context.repository.getDeviceById(device.id);

    assert.equal(redeemed.headers['cache-control'], 'no-store');
    assert.match(device.id, /^[a-f\d]{24}$/i);
    assert.equal(device.pairingStatus, 'paired');
    assert.equal(device.lastSeenAt, null);
    assert.equal(device.enforcementStatus, 'not_implemented');
    assert.match(deviceCredential, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(storedDevice.credentialHash, hashSecret(deviceCredential));
    assert.equal(Object.hasOwn(storedDevice, 'deviceCredential'), false);
    assert.equal(Object.hasOwn(storedDevice, 'familyId'), true);

    const parentDevices = await authenticated('get', '/api/v1/devices').expect(200);
    assert.equal(parentDevices.body.data.devices.length, 1);
    assert.equal(parentDevices.body.data.devices[0].childProfileId, child.id);
    assert.equal(Object.hasOwn(parentDevices.body.data.devices[0], 'credentialHash'), false);
    assert.equal(Object.hasOwn(parentDevices.body.data.devices[0], 'deviceCredential'), false);
  });

  it('rejects expired, revoked, reused, and unknown codes with one generic response', async () => {
    const child = (await createChild('Code child')).body.data.child;
    const expiredCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;
    context.setNow(new Date(Date.parse(expiredCode.expiresAt) + 1));
    const expired = await redeem(expiredCode.code).expect(400);

    context.setNow('2026-10-13T00:00:00.000Z');
    const revokedCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;
    await authenticated('delete', `/api/v1/children/${child.id}/pairing-codes/${revokedCode.id}`).expect(204);
    const revoked = await redeem(revokedCode.code).expect(400);

    const usedCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;
    await redeem(usedCode.code).expect(201);
    const reused = await redeem(usedCode.code).expect(400);
    const unknown = await redeem('Z'.repeat(22)).expect(400);

    const messages = [expired, revoked, reused, unknown].map((response) => response.body.error.message);
    assert.deepEqual(new Set(messages), new Set(['Pairing code is invalid or unavailable.']));
    assert.equal(context.repository.deviceCount(), 1);
  });

  it('allows only one of two concurrent redemption requests to claim a code', async () => {
    const child = (await createChild('Concurrent child')).body.data.child;
    const pairingCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;

    const results = await Promise.all([
      redeem(pairingCode.code),
      redeem(pairingCode.code),
    ]);

    assert.deepEqual(results.map(({ status }) => status).sort(), [201, 400]);
    assert.equal(context.repository.deviceCount(), 1);
    assert.equal(results.filter(({ status }) => status === 201).length, 1);
  });

  it('does not restore a claimed code if device registration storage fails', async () => {
    const child = (await createChild('Storage failure child')).body.data.child;
    const pairingCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;
    context.repository.failNextDeviceCreate(new DevicePairingStorageUnavailableError());

    const failedEnrollment = await redeem(pairingCode.code).expect(503);
    assert.equal(failedEnrollment.body.error.message, 'Device pairing is temporarily unavailable.');
    assert.equal(context.repository.deviceCount(), 0);

    const retry = await redeem(pairingCode.code).expect(400);
    assert.equal(retry.body.error.message, 'Pairing code is invalid or unavailable.');
    assert.equal(context.repository.deviceCount(), 0);
  });

  it('allows a parent to revoke a registration when its one-time credential response is lost', async () => {
    const child = (await createChild('Ambiguous enrollment child')).body.data.child;
    const pairingCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;
    const redeemOnce = context.repository.redeemPairingCode.bind(context.repository);
    context.repository.redeemPairingCode = async (input) => {
      await redeemOnce(input);
      context.repository.redeemPairingCode = redeemOnce;
      throw new DevicePairingStorageUnavailableError();
    };

    const uncertain = await redeem(pairingCode.code).expect(503);
    assert.equal(uncertain.body.error.message, 'Device pairing is temporarily unavailable.');
    assert.equal(Object.hasOwn(uncertain.body.data ?? {}, 'deviceCredential'), false);
    assert.equal(context.repository.deviceCount(), 1);

    const [device] = (await authenticated('get', '/api/v1/devices').expect(200)).body.data.devices;
    assert.equal(device.pairingStatus, 'paired');
    assert.equal(Object.hasOwn(device, 'deviceCredential'), false);
    await authenticated('delete', `/api/v1/devices/${device.id}`).expect(204);
    assert.equal((await authenticated('get', '/api/v1/devices').expect(200)).body.data.devices[0].pairingStatus, 'revoked');
    await redeem(pairingCode.code).expect(400);
  });

  it('prevents cross-family code creation, code revocation, device listing, and device revocation', async () => {
    const child = (await createChild('Private device')).body.data.child;
    const otherFamilyIssue = await issueCode(child.id, TOKEN_PARENT_TWO).expect(404);
    assert.equal(otherFamilyIssue.body.error.message, 'Child profile not found.');
    assert.equal(context.repository.pairingCodeCount(), 0);

    const pairingCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;
    const otherFamilyRevokeCode = await authenticated(
      'delete',
      `/api/v1/children/${child.id}/pairing-codes/${pairingCode.id}`,
      TOKEN_PARENT_TWO,
    ).expect(404);
    assert.equal(otherFamilyRevokeCode.body.error.message, 'Child profile not found.');

    const redeemed = await redeem(pairingCode.code).expect(201);
    const deviceId = redeemed.body.data.device.id;
    assert.deepEqual((await authenticated('get', '/api/v1/devices', TOKEN_PARENT_TWO).expect(200)).body.data.devices, []);
    const otherFamilyRevokeDevice = await authenticated('delete', `/api/v1/devices/${deviceId}`, TOKEN_PARENT_TWO).expect(404);
    assert.equal(otherFamilyRevokeDevice.body.error.message, 'Device not found.');
    assert.equal((await authenticated('get', '/api/v1/devices').expect(200)).body.data.devices[0].pairingStatus, 'paired');
  });

  it('revokes a device within the owner family and keeps enforcement status honest', async () => {
    const child = (await createChild('Revocable device')).body.data.child;
    const pairingCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;
    const redeemed = await redeem(pairingCode.code).expect(201);

    await authenticated('delete', `/api/v1/devices/${redeemed.body.data.device.id}`).expect(204);
    const listed = await authenticated('get', '/api/v1/devices').expect(200);
    const [device] = listed.body.data.devices;

    assert.equal(device.pairingStatus, 'revoked');
    assert.ok(device.revokedAt);
    assert.equal(device.lastSeenAt, null);
    assert.equal(device.enforcementStatus, 'not_implemented');
    assert.equal(Object.hasOwn(device, 'deviceCredential'), false);
  });

  it('rejects missing Origin, untrusted Origin, invalid input, and client ownership claims', async () => {
    const child = (await createChild('Origin child')).body.data.child;
    await issueCode(child.id, TOKEN_PARENT_ONE, null).expect(403);
    await issueCode(child.id, TOKEN_PARENT_ONE, 'https://attacker.example').expect(403);

    const malformed = await redeem('not-a-code').expect(400);
    const invalidPlatform = await redeem('A'.repeat(22), { platform: 'browser-extension' }).expect(400);
    const ownershipClaim = await redeem('B'.repeat(22), { parentId: PARENT_TWO.id, familyId: '64b000000000000000000099' }).expect(400);
    const createOwnershipClaim = await authenticated(
      'post',
      `/api/v1/children/${child.id}/pairing-codes`,
    ).send({ familyId: '64b000000000000000000099', parentId: PARENT_TWO.id }).expect(400);
    const invalidChildId = await issueCode('not-an-id').expect(404);
    const invalidCodeId = await authenticated(
      'delete',
      `/api/v1/children/${child.id}/pairing-codes/not-an-id`,
    ).expect(404);
    const invalidDeviceId = await authenticated('delete', '/api/v1/devices/not-an-id').expect(404);
    for (const response of [malformed, invalidPlatform, ownershipClaim, createOwnershipClaim]) {
      assert.equal(response.body.error.message, 'Invalid request body.');
    }
    assert.equal(invalidChildId.body.error.message, 'Child profile not found.');
    assert.equal(invalidCodeId.body.error.message, 'Pairing code not found.');
    assert.equal(invalidDeviceId.body.error.message, 'Device not found.');
    assert.equal(context.repository.pairingCodeCount(), 0);
    assert.equal(context.repository.deviceCount(), 0);
  });

  it('requires exact Origin checks when a parent revokes a code or device', async () => {
    const child = (await createChild('Origin-protected device')).body.data.child;
    const pairingCode = (await issueCode(child.id).expect(201)).body.data.pairingCode;
    await authenticated(
      'delete',
      `/api/v1/children/${child.id}/pairing-codes/${pairingCode.id}`,
      TOKEN_PARENT_ONE,
      null,
    ).expect(403);

    const redeemed = await redeem(pairingCode.code).expect(201);
    await authenticated('delete', `/api/v1/devices/${redeemed.body.data.device.id}`, TOKEN_PARENT_ONE, null).expect(403);
    assert.equal((await authenticated('get', '/api/v1/devices').expect(200)).body.data.devices[0].pairingStatus, 'paired');
  });

  it('requires a parent session and fails closed when pairing storage is unavailable', async () => {
    const unauthenticated = await request(context.app)
      .get('/api/v1/devices')
      .set('x-parent-id', PARENT_ONE.id)
      .query({ parentId: PARENT_ONE.id })
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(401);
    assert.equal(unauthenticated.body.error.message, 'Authentication required.');

    const unavailableService = {
      async createPairingCode() { throw new DevicePairingStorageUnavailableError(); },
      async revokePairingCode() { throw new DevicePairingStorageUnavailableError(); },
      async redeemPairingCode() { throw new DevicePairingStorageUnavailableError(); },
      async listDevices() { throw new DevicePairingStorageUnavailableError(); },
      async revokeDevice() { throw new DevicePairingStorageUnavailableError(); },
    };
    const app = createApp({
      authService: { async authenticate() { return PARENT_ONE; }, async register() {}, async login() {}, async logout() {} },
      devicePairingService: unavailableService,
      runtimeEnv: TEST_ENV,
    });
    const unavailable = await request(app)
      .get('/api/v1/devices')
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);

    assert.equal(unavailable.body.error.message, 'Device pairing is temporarily unavailable.');
    assert.doesNotMatch(JSON.stringify(unavailable.body), /Mongo|database|connection string/i);

    const mongoApp = createApp({
      authService: { async authenticate() { return PARENT_ONE; }, async register() {}, async login() {}, async logout() {} },
      devicePairingService: mongoDevicePairingService,
      runtimeEnv: TEST_ENV,
    });
    const disconnected = await request(mongoApp)
      .get('/api/v1/devices')
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);
    assert.equal(disconnected.body.error.message, 'Device pairing is temporarily unavailable.');
  });

  it('rate limits pairing-code redemption attempts', async () => {
    const invalidCode = 'C'.repeat(22);
    const responses = await Promise.all(Array.from({ length: 11 }, () => redeem(invalidCode)));

    assert.equal(responses.filter(({ status }) => status === 400).length, 10);
    const limited = responses.filter(({ status }) => status === 429);
    assert.equal(limited.length, 1);
    assert.equal(limited[0].body.error.message, 'Too many pairing attempts. Try again later.');
    assert.equal(context.repository.deviceCount(), 0);
  });

  it('declares unique secret indexes, expiry cleanup, and family ownership indexes', () => {
    const codeIndexes = PairingCode.schema.indexes();
    const deviceIndexes = DeviceRegistration.schema.indexes();

    assert.ok(codeIndexes.some(([fields, options]) => fields.codeHash === 1 && options.unique));
    assert.ok(codeIndexes.some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
    assert.ok(deviceIndexes.some(([fields, options]) => fields.pairingCodeId === 1 && options.unique));
    assert.ok(deviceIndexes.some(([fields, options]) => fields.credentialHash === 1 && options.unique));
    assert.ok(deviceIndexes.some(([fields]) => fields.familyId === 1 && fields.pairedAt === -1));
    assert.equal(PairingCode.schema.path('familyId').options.immutable, true);
    assert.equal(PairingCode.schema.path('childProfileId').options.immutable, true);
    assert.equal(DeviceRegistration.schema.path('credentialHash').options.select, false);
    assert.equal(DeviceRegistration.schema.path('familyId').options.immutable, true);
  });
});
