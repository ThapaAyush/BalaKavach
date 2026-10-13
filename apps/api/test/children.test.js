import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import ChildProfile from '../src/models/ChildProfile.js';
import Family from '../src/models/Family.js';
import { FamilyChildStorageUnavailableError } from '../src/services/familyChildErrors.js';
import { familyChildService as mongoFamilyChildService } from '../src/services/familyChildService.js';
import { createFamilyChildService } from '../src/services/familyChildService.js';
import { createMemoryFamilyChildRepository } from '../test-support/memoryFamilyChildRepository.js';

const CLIENT_ORIGIN = 'http://localhost:5173';
const OPERATION_TIMEOUT_MS = 5_000;
const TOKEN_PARENT_ONE = 'a'.repeat(43);
const TOKEN_PARENT_TWO = 'b'.repeat(43);
const PARENT_ONE = { id: '64b000000000000000000001', email: 'one@example.com' };
const PARENT_TWO = { id: '64b000000000000000000002', email: 'two@example.com' };
const TEST_ENV = Object.freeze({ NODE_ENV: 'test', CLIENT_ORIGIN });

const cookieFor = (token) => `kidsguard_session=${token}`;

function get(path, token = TOKEN_PARENT_ONE) {
  return request(context.app)
    .get(`/api/v1/children${path}`)
    .set('Cookie', cookieFor(token))
    .timeout({ deadline: OPERATION_TIMEOUT_MS });
}

function post(body, token = TOKEN_PARENT_ONE, origin = CLIENT_ORIGIN) {
  const req = request(context.app)
    .post('/api/v1/children')
    .set('Cookie', cookieFor(token))
    .send(body)
    .timeout({ deadline: OPERATION_TIMEOUT_MS });
  return origin === null ? req : req.set('Origin', origin);
}

function mutate(method, childId, body, token = TOKEN_PARENT_ONE, origin = CLIENT_ORIGIN) {
  let req = request(context.app)
    [method](`/api/v1/children/${childId}`)
    .set('Cookie', cookieFor(token))
    .timeout({ deadline: OPERATION_TIMEOUT_MS });
  if (body !== undefined) req = req.send(body);
  if (origin !== null) req = req.set('Origin', origin);
  return req;
}

let context;

beforeEach(() => {
  const repository = createMemoryFamilyChildRepository();
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
  context = {
    repository,
    app: createApp({
      authService,
      familyChildService: createFamilyChildService({ repository }),
      runtimeEnv: TEST_ENV,
    }),
  };
});

afterEach(() => context?.repository.clear());

describe('parent-authorized child profiles', { concurrency: false }, () => {
  it('supports create, list, retrieve, update, and delete for the owning parent', async () => {
    const created = await post({ displayName: ' Sam ', dateOfBirth: '2017-04-18' }).expect(201);
    const child = created.body.data.child;
    assert.equal(child.displayName, 'Sam');
    assert.equal(child.dateOfBirth, '2017-04-18');
    assert.equal(Object.hasOwn(child, 'familyId'), false);
    assert.match(created.headers['cache-control'], /no-store/i);

    const list = await get('').expect(200);
    assert.deepEqual(list.body.data.children.map(({ id }) => id), [child.id]);
    const retrieved = await get(`/${child.id}`).expect(200);
    assert.equal(retrieved.body.data.child.displayName, 'Sam');

    const updated = await mutate('patch', child.id, { displayName: 'Samuel' }).expect(200);
    assert.equal(updated.body.data.child.displayName, 'Samuel');
    const clearedDate = await mutate('patch', child.id, { dateOfBirth: null }).expect(200);
    assert.equal(clearedDate.body.data.child.dateOfBirth, null);

    await mutate('delete', child.id).expect(204);
    await get(`/${child.id}`).expect(404);
    assert.deepEqual((await get('').expect(200)).body.data.children, []);
  });

  it('handles simultaneous first-child requests for one parent in the same family', async () => {
    const [first, second] = await Promise.all([
      post({ displayName: 'First child' }).expect(201),
      post({ displayName: 'Second child' }).expect(201),
    ]);

    const family = context.repository.getFamilyForParent(PARENT_ONE.id);
    assert.ok(family);
    assert.deepEqual(
      (await get('').expect(200)).body.data.children.map(({ displayName }) => displayName).sort(),
      ['First child', 'Second child'],
    );
    assert.equal(context.repository.getFamilyForParent(PARENT_ONE.id)._id, family._id);
    assert.notEqual(first.body.data.child.id, second.body.data.child.id);
  });

  it('does not let one parent read, update, or delete another parent’s child', async () => {
    const created = await post({ displayName: 'Private profile' }).expect(201);
    const childId = created.body.data.child.id;
    const otherParentChild = await post({ displayName: 'Other family profile' }, TOKEN_PARENT_TWO).expect(201);
    const parentOneFamily = context.repository.getFamilyForParent(PARENT_ONE.id);
    const parentTwoFamily = context.repository.getFamilyForParent(PARENT_TWO.id);

    assert.notEqual(parentOneFamily._id, parentTwoFamily._id);
    assert.deepEqual((await get('', TOKEN_PARENT_TWO).expect(200)).body.data.children.map(({ id }) => id), [otherParentChild.body.data.child.id]);

    const read = await get(`/${childId}`, TOKEN_PARENT_TWO).expect(404);
    const update = await mutate('patch', childId, { displayName: 'Hijacked' }, TOKEN_PARENT_TWO).expect(404);
    const deletion = await mutate('delete', childId, undefined, TOKEN_PARENT_TWO).expect(404);

    for (const response of [read, update, deletion]) {
      assert.equal(response.body.error.message, 'Child profile not found.');
    }
    const ownerView = await get(`/${childId}`, TOKEN_PARENT_ONE).expect(200);
    assert.equal(ownerView.body.data.child.displayName, 'Private profile');
    assert.equal((await get('', TOKEN_PARENT_ONE).expect(200)).body.data.children.length, 1);
    await get(`/${otherParentChild.body.data.child.id}`, TOKEN_PARENT_ONE).expect(404);
  });

  it('rejects client-supplied family or parent ownership claims', async () => {
    const createResponse = await post({
      displayName: 'Child',
      familyId: '64b000000000000000000099',
      parentId: PARENT_TWO.id,
      ownerParentId: PARENT_TWO.id,
    }).expect(400);
    assert.equal(createResponse.body.error.message, 'Invalid request body.');
    assert.equal(context.repository.getFamilyForParent(PARENT_ONE.id), null);

    const created = await post({ displayName: 'Child' }).expect(201);
    const updateResponse = await mutate('patch', created.body.data.child.id, {
      displayName: 'Changed',
      familyId: '64b000000000000000000099',
    }).expect(400);
    assert.equal(updateResponse.body.error.message, 'Invalid request body.');
    assert.equal((await get(`/${created.body.data.child.id}`).expect(200)).body.data.child.displayName, 'Child');
  });

  it('requires an exact Origin for child-profile mutations', async () => {
    const missingOrigin = await post({ displayName: 'Child' }, TOKEN_PARENT_ONE, null).expect(403);
    const foreignOrigin = await post({ displayName: 'Child' }, TOKEN_PARENT_ONE, 'https://attacker.example').expect(403);
    assert.equal(missingOrigin.body.error.message, 'Request origin is not allowed.');
    assert.equal(foreignOrigin.body.error.message, 'Request origin is not allowed.');
    assert.equal((await get('').expect(200)).body.data.children.length, 0);

    const child = await post({ displayName: 'Child' }).expect(201);
    await mutate('patch', child.body.data.child.id, { displayName: 'Changed' }, TOKEN_PARENT_ONE, null).expect(403);
    await mutate('delete', child.body.data.child.id, undefined, TOKEN_PARENT_ONE, 'null').expect(403);
    assert.equal((await get(`/${child.body.data.child.id}`).expect(200)).body.data.child.displayName, 'Child');
  });

  it('validates profile fields and returns the same 404 for malformed and unknown child IDs', async () => {
    const invalidName = await post({ displayName: '   ' }).expect(400);
    const invalidDate = await post({ displayName: 'Child', dateOfBirth: '2024-02-30' }).expect(400);
    const futureDate = await post({ displayName: 'Child', dateOfBirth: '2999-01-01' }).expect(400);
    assert.equal(invalidName.body.error.message, 'Invalid request body.');
    assert.equal(invalidDate.body.error.message, 'Invalid request body.');
    assert.equal(futureDate.body.error.message, 'Invalid request body.');

    const malformed = await get('/not-an-id').expect(404);
    const unknown = await get('/64b000000000000000000099').expect(404);
    assert.equal(malformed.body.error.message, unknown.body.error.message);
    assert.equal(unknown.body.error.message, 'Child profile not found.');
  });

  it('requires a valid parent session before touching child storage', async () => {
    const response = await request(context.app)
      .get('/api/v1/children')
      .set('x-parent-id', PARENT_ONE.id)
      .query({ parentId: PARENT_ONE.id })
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(401);
    assert.equal(response.body.error.message, 'Authentication required.');
    assert.equal(context.repository.getFamilyForParent(PARENT_ONE.id), null);
  });

  it('fails closed with a generic service-unavailable response when storage is unavailable', async () => {
    const unavailableService = {
      async listChildren() { throw new FamilyChildStorageUnavailableError(); },
      async createChild() { throw new FamilyChildStorageUnavailableError(); },
      async getChild() { throw new FamilyChildStorageUnavailableError(); },
      async updateChild() { throw new FamilyChildStorageUnavailableError(); },
      async deleteChild() { throw new FamilyChildStorageUnavailableError(); },
    };
    const app = createApp({
      authService: {
        async authenticate() { return PARENT_ONE; },
        async register() {}, async login() {}, async logout() {},
      },
      familyChildService: unavailableService,
      runtimeEnv: TEST_ENV,
    });

    const response = await request(app)
      .get('/api/v1/children')
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);
    assert.equal(response.body.error.message, 'Child profiles are temporarily unavailable.');
    assert.doesNotMatch(JSON.stringify(response.body), /Mongo|database|connection string/i);
  });

  it('fails closed when the real MongoDB repository has no configured connection', async () => {
    const app = createApp({
      authService: {
        async authenticate() { return PARENT_ONE; },
        async register() {}, async login() {}, async logout() {},
      },
      familyChildService: mongoFamilyChildService,
      runtimeEnv: TEST_ENV,
    });
    const response = await request(app)
      .get('/api/v1/children')
      .set('Cookie', cookieFor(TOKEN_PARENT_ONE))
      .timeout({ deadline: OPERATION_TIMEOUT_MS })
      .expect(503);

    assert.equal(response.body.error.message, 'Child profiles are temporarily unavailable.');
  });

  it('declares a single family owner and family-scoped child index', () => {
    const familyIndexes = Family.schema.indexes();
    const childIndexes = ChildProfile.schema.indexes();
    assert.ok(familyIndexes.some(([fields, options]) => fields.ownerParentId === 1 && options.unique));
    assert.ok(childIndexes.some(([fields]) => fields.familyId === 1 && fields.createdAt === 1));
    assert.equal(Family.schema.path('ownerParentId').options.immutable, true);
    assert.equal(ChildProfile.schema.path('familyId').options.immutable, true);
  });
});
