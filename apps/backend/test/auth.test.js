import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import Parent from '../src/models/Parent.js';
import ParentSession from '../src/models/ParentSession.js';
import { authService, createAuthService, hashSessionToken } from '../src/services/authService.js';
import { AuthDatabaseUnavailableError } from '../src/services/authErrors.js';
import { normalizeAuthRepositoryError } from '../src/services/authRepository.js';
import { createMemoryAuthRepository } from '../test-support/memoryAuthRepository.js';

const CLIENT_ORIGIN = 'http://localhost:5173';
const OPERATION_TIMEOUT_MS = 5_000;
const TEST_PASSWORD = 'correct horse battery staple';
const TEST_ENV = Object.freeze({
  NODE_ENV: 'test',
  CLIENT_ORIGIN,
  AUTH_SESSION_TTL_HOURS: 168,
});

let context;

function post(path, body, origin = CLIENT_ORIGIN) {
  return request(context.app)
    .post(`/api/v1/auth/${path}`)
    .set('Origin', origin)
    .send(body)
    .timeout({ deadline: OPERATION_TIMEOUT_MS });
}

function postWithoutOrigin(path, body) {
  return request(context.app)
    .post(`/api/v1/auth/${path}`)
    .send(body)
    .timeout({ deadline: OPERATION_TIMEOUT_MS });
}

function get(path) {
  return request(context.app)
    .get(`/api/v1/auth/${path}`)
    .timeout({ deadline: OPERATION_TIMEOUT_MS });
}

function cookiePair(response) {
  const [cookie] = response.headers['set-cookie'] ?? [];
  assert.ok(cookie, 'expected a session cookie');
  return cookie.split(';', 1)[0];
}

async function register(email = 'parent@example.com', password = TEST_PASSWORD) {
  return post('register', { email, password }).expect(202);
}

async function login(email = 'parent@example.com', password = TEST_PASSWORD) {
  return post('login', { email, password }).expect(200);
}

beforeEach(() => {
  const repository = createMemoryAuthRepository();
  const authService = createAuthService({ repository });
  context = {
    repository,
    app: createApp({ authService, runtimeEnv: TEST_ENV }),
  };
});

afterEach(() => {
  context?.repository.clear();
});

describe('parent authentication', { concurrency: false }, () => {
  it('normalizes registration email and stores only an Argon2id password hash', { timeout: 15_000 }, async () => {
    const response = await register(' Parent@Example.COM ');
    const storedParent = context.repository.getParentByEmail('parent@example.com');

    assert.equal(response.body.data.message, 'Registration request received. You can try signing in.');
    assert.equal(JSON.stringify(response.body).includes('parent@example.com'), false);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.match(storedParent.passwordHash, /^\$argon2id\$/);
    assert.match(storedParent.passwordHash, /\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
    assert.notEqual(storedParent.passwordHash, TEST_PASSWORD);
    assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);
  });

  it('returns the same registration response for duplicate addresses without exposing account details', { timeout: 15_000 }, async () => {
    const first = await register('parent@example.com');

    const response = await post('register', {
      email: ' PARENT@example.com ',
      password: TEST_PASSWORD,
    }).expect(202);

    assert.equal(response.status, first.status);
    assert.deepEqual(response.body, first.body);
    assert.equal(JSON.stringify(response.body).includes('parent@example.com'), false);
    assert.equal(JSON.stringify(response.body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(response.body).includes('parentId'), false);
  });

  it('does not mask unrelated unique-index failures as duplicate emails', async () => {
    const unrelatedDuplicate = Object.assign(new Error('another unique index failed'), {
      code: 11000,
      keyPattern: { externalId: 1 },
    });
    const service = createAuthService({
      repository: { createParent: async () => { throw unrelatedDuplicate; } },
      hashPassword: async () => 'test-hash',
    });

    await assert.rejects(
      service.register({ email: 'parent@example.com', password: TEST_PASSWORD }),
      (error) => error === unrelatedDuplicate,
    );
  });

  it('validates email and password input and rejects client-supplied identity fields', { timeout: 10_000 }, async () => {
    const invalidEmail = await post('register', {
      email: 'not-an-email',
      password: TEST_PASSWORD,
    }).expect(400);
    const shortPassword = await post('register', {
      email: 'parent@example.com',
      password: '1234567',
    }).expect(400);
    const blankPassword = await post('register', {
      email: 'parent@example.com',
      password: ' '.repeat(8),
    }).expect(400);
    const longPassword = await post('register', {
      email: 'parent@example.com',
      password: 'x'.repeat(129),
    }).expect(400);
    const longLoginPassword = await post('login', {
      email: 'parent@example.com',
      password: 'x'.repeat(129),
    }).expect(400);
    const suppliedIdentity = await post('register', {
      email: 'parent@example.com',
      password: TEST_PASSWORD,
      userId: 'someone-else',
    }).expect(400);

    assert.equal(invalidEmail.body.error.message, 'Invalid request body.');
    assert.equal(shortPassword.body.error.message, 'Invalid request body.');
    assert.equal(blankPassword.body.error.message, 'Invalid request body.');
    assert.equal(longPassword.body.error.message, 'Invalid request body.');
    assert.equal(longLoginPassword.body.error.message, 'Invalid request body.');
    assert.equal(suppliedIdentity.body.error.message, 'Invalid request body.');
    assert.equal(context.repository.getParentByEmail('parent@example.com'), null);
  });

  it('creates an HttpOnly strict session cookie on successful login and stores only its hash', { timeout: 20_000 }, async () => {
    await register();
    const response = await login();
    const pair = cookiePair(response);
    const [, token] = pair.split('=');
    const storedHashes = context.repository.getSessionTokenHashes();

    assert.equal(response.body.data.parent.email, 'parent@example.com');
    assert.match(response.headers['cache-control'], /no-store/i);
    assert.equal(JSON.stringify(response.body).includes(token), false);
    assert.match(response.headers['set-cookie'][0], /^kidsguard_session=/);
    assert.match(response.headers['set-cookie'][0], /HttpOnly/i);
    assert.match(response.headers['set-cookie'][0], /SameSite=Strict/i);
    assert.match(response.headers['set-cookie'][0], /Path=\//i);
    assert.doesNotMatch(response.headers['set-cookie'][0], /;\s*Secure(?:;|$)/i);
    assert.doesNotMatch(response.headers['set-cookie'][0], /Domain=/i);
    assert.equal(storedHashes.length, 1);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(token, 'base64url').length, 32);
    assert.equal(storedHashes[0], hashSessionToken(token));
    assert.notEqual(storedHashes[0], token);
  });

  it('uses a Secure Host-prefixed cookie in production', { timeout: 15_000 }, async () => {
    const repository = createMemoryAuthRepository();
    const authServiceForProduction = createAuthService({ repository });
    const app = createApp({
      authService: authServiceForProduction,
      runtimeEnv: { ...TEST_ENV, NODE_ENV: 'production' },
    });

    await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', CLIENT_ORIGIN)
      .send({ email: 'parent@example.com', password: TEST_PASSWORD })
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(202);
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .send({ email: 'parent@example.com', password: TEST_PASSWORD })
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(200);
    const cookie = response.headers['set-cookie'][0];

    assert.match(cookie, /^__Host-kidsguard_session=/);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\//i);
    assert.doesNotMatch(cookie, /Domain=/i);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', CLIENT_ORIGIN)
      .set('Cookie', cookie.split(';', 1)[0])
      .send({})
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(204);
    const clearedCookie = logout.headers['set-cookie'][0];
    assert.match(clearedCookie, /^__Host-kidsguard_session=/);
    assert.match(clearedCookie, /Secure/i);
    assert.match(clearedCookie, /HttpOnly/i);
    assert.match(clearedCookie, /SameSite=Strict/i);
    assert.match(clearedCookie, /Path=\//i);
    assert.doesNotMatch(clearedCookie, /Domain=/i);
    assert.match(clearedCookie, /Expires=/i);
  });

  it('uses the same login failure response for unknown email and wrong password', { timeout: 20_000 }, async () => {
    await register();
    const wrongPassword = await post('login', {
      email: 'parent@example.com',
      password: 'not the right password',
    }).expect(401);
    const unknownEmail = await post('login', {
      email: 'unknown@example.com',
      password: 'not the right password',
    }).expect(401);

    assert.equal(wrongPassword.body.error.message, 'Email or password is incorrect.');
    assert.equal(unknownEmail.body.error.message, wrongPassword.body.error.message);
    assert.equal(wrongPassword.headers['set-cookie'], undefined);
  });

  it('protects the current-parent route and ignores client-supplied user IDs', { timeout: 20_000 }, async () => {
    await register();
    const unauthenticated = await get('me')
      .set('x-user-id', 'attacker-selected-id')
      .query({ userId: 'attacker-selected-id' })
      .expect(401);
    const authenticated = await login();
    const response = await get('me').set('Cookie', cookiePair(authenticated)).expect(200);

    assert.equal(unauthenticated.body.error.message, 'Authentication required.');
    assert.deepEqual(response.body.data.parent, authenticated.body.data.parent);
  });

  it('rejects invalid and expired session cookies', { timeout: 20_000 }, async () => {
    const invalid = await get('me')
      .set('Cookie', 'kidsguard_session=invalid-token')
      .expect(401);
    await register();
    const authenticated = await login();
    context.repository.expireSessions();
    const expired = await get('me')
      .set('Cookie', cookiePair(authenticated))
      .expect(401);

    assert.equal(invalid.body.error.message, 'Authentication required.');
    assert.equal(expired.body.error.message, 'Authentication required.');
  });

  it('rejects cross-origin authentication mutations', { timeout: 10_000 }, async () => {
    const body = {
      email: 'parent@example.com',
      password: TEST_PASSWORD,
    };
    const missingOrigin = await postWithoutOrigin('register', body).expect(403);
    const opaqueOrigin = await post('register', body, 'null').expect(403);
    const crossOrigin = await post('register', body, 'https://attacker.example').expect(403);
    const lookalikeOrigin = await post('register', body, `${CLIENT_ORIGIN}.attacker.example`).expect(403);

    for (const response of [missingOrigin, opaqueOrigin, crossOrigin, lookalikeOrigin]) {
      assert.equal(response.body.error.message, 'Request origin is not allowed.');
    }
    assert.equal(context.repository.getParentByEmail('parent@example.com'), null);
  });

  it('rejects logout when Origin is missing and preserves the still-active session', { timeout: 20_000 }, async () => {
    await register();
    const authenticated = await login();
    const cookie = cookiePair(authenticated);

    const rejected = await postWithoutOrigin('logout', {}).set('Cookie', cookie).expect(403);
    assert.equal(rejected.body.error.message, 'Request origin is not allowed.');
    assert.equal(context.repository.getSessionCount(), 1);
    await get('me').set('Cookie', cookie).expect(200);
  });

  it('fails closed with generic unavailable responses for database outages', { timeout: 10_000 }, async () => {
    const unavailable = () => { throw new AuthDatabaseUnavailableError(); };
    const repository = {
      assertAvailable: unavailable,
      findActiveSession: unavailable,
      deleteSession: unavailable,
    };
    const unavailableApp = createApp({
      authService: createAuthService({ repository }),
      runtimeEnv: TEST_ENV,
    });

    const registration = await request(unavailableApp)
      .post('/api/v1/auth/register')
      .set('Origin', CLIENT_ORIGIN)
      .send({ email: 'parent@example.com', password: TEST_PASSWORD })
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);
    const login = await request(unavailableApp)
      .post('/api/v1/auth/login')
      .set('Origin', CLIENT_ORIGIN)
      .send({ email: 'parent@example.com', password: TEST_PASSWORD })
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);
    const protectedRoute = await request(unavailableApp)
      .get('/api/v1/auth/me')
      .set('Cookie', `kidsguard_session=${'a'.repeat(43)}`)
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);
    const logout = await request(unavailableApp)
      .post('/api/v1/auth/logout')
      .set('Origin', CLIENT_ORIGIN)
      .set('Cookie', `kidsguard_session=${'a'.repeat(43)}`)
      .send({})
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);
    for (const response of [registration, login, protectedRoute, logout]) {
      assert.equal(response.body.error.message, 'Authentication is temporarily unavailable.');
    }
    assert.equal(logout.headers['set-cookie'], undefined);
  });

  it('normalizes mid-operation MongoDB network failures to unavailable errors', () => {
    const networkError = new Error('private driver details');
    networkError.name = 'MongoNetworkError';
    const duplicateKey = Object.assign(new Error('duplicate'), { code: 11000 });

    assert.equal(normalizeAuthRepositoryError(networkError, 1).status, 503);
    assert.equal(normalizeAuthRepositoryError(new Error('disconnected'), 0).status, 503);
    assert.equal(normalizeAuthRepositoryError(duplicateKey, 1), duplicateKey);
    assert.equal(normalizeAuthRepositoryError(new Error('unexpected schema error'), 1).status, undefined);
  });

  it('enforces the authentication attempt limit before calling registration logic', { timeout: 10_000 }, async () => {
    let registrationCalls = 0;
    const limitedApp = createApp({
      authService: {
        async register() { registrationCalls += 1; },
        async login() { throw new Error('login should not be called'); },
        async logout() {},
        async authenticate() { return null; },
      },
      runtimeEnv: TEST_ENV,
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(limitedApp)
        .post('/api/v1/auth/register')
        .set('Origin', CLIENT_ORIGIN)
        .send({ email: 'parent@example.com', password: TEST_PASSWORD })
        .timeout({ deadline: OPERATION_TIMEOUT_MS })
        .expect(202);
    }
    const blocked = await request(limitedApp)
      .post('/api/v1/auth/register')
      .set('Origin', CLIENT_ORIGIN)
      .send({ email: 'parent@example.com', password: TEST_PASSWORD })
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(429);

    assert.equal(registrationCalls, 10);
    assert.match(blocked.headers['ratelimit'], /10-in-15min/i);
    assert.match(blocked.headers['cache-control'], /no-store/i);
  });

  it('declares database uniqueness and expiry indexes and fails closed without MongoDB', { timeout: 10_000 }, async () => {
    const parentIndexes = Parent.schema.indexes();
    const sessionIndexes = ParentSession.schema.indexes();
    const app = createApp({ authService, runtimeEnv: TEST_ENV });
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', CLIENT_ORIGIN)
      .send({ email: 'parent@example.com', password: TEST_PASSWORD })
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);

    assert.ok(parentIndexes.some(([fields, options]) => fields.email === 1 && options.unique));
    assert.ok(sessionIndexes.some(([fields, options]) => fields.tokenHash === 1 && options.unique));
    assert.ok(sessionIndexes.some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
    assert.equal(response.body.error.message, 'Authentication is temporarily unavailable.');
  });

  it('invalidates a logged-out session and clears the cookie', { timeout: 20_000 }, async () => {
    await register();
    const authenticated = await login();
    const cookie = cookiePair(authenticated);
    assert.equal(context.repository.getSessionCount(), 1);

    const response = await post('logout', {}).set('Cookie', cookie).expect(204);
    const currentParent = await get('me').set('Cookie', cookie).expect(401);

    assert.ok(response.headers['set-cookie']?.[0].includes('Expires='));
    assert.equal(currentParent.body.error.message, 'Authentication required.');
    assert.equal(context.repository.getSessionCount(), 0);
  });
});
