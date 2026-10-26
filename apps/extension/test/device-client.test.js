import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDeviceClient,
  normalizeApiBaseUrl,
  DEVICE_SESSION_STORAGE_KEY,
  DEFAULT_API_BASE_URL,
} from '../src/device-client.js';

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    store,
    async get(key) {
      return { [key]: store[key] };
    },
    async set(entries) {
      Object.assign(store, entries);
    },
  };
}

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return { fn, calls };
}

function jsonResponse(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test('normalizeApiBaseUrl allows local HTTP and trims trailing slashes', () => {
  assert.equal(normalizeApiBaseUrl('http://localhost:5000/api/v1/'), 'http://localhost:5000/api/v1');
  assert.equal(normalizeApiBaseUrl('http://127.0.0.1:5000/api/v1'), 'http://127.0.0.1:5000/api/v1');
  assert.equal(normalizeApiBaseUrl('http://[::1]:5000/api/v1'), 'http://[::1]:5000/api/v1');
  assert.equal(normalizeApiBaseUrl(), DEFAULT_API_BASE_URL);
});

test('normalizeApiBaseUrl allows remote HTTPS but rejects insecure remote HTTP', () => {
  assert.equal(normalizeApiBaseUrl('https://api.kidsguard.example.com/api/v1'), 'https://api.kidsguard.example.com/api/v1');
  assert.throws(
    () => normalizeApiBaseUrl('http://api.kidsguard.example.com/api/v1'),
    /Insecure HTTP is not allowed for non-local host/u,
  );
  assert.throws(
    () => normalizeApiBaseUrl('http://192.168.1.100:5000/api/v1'),
    /Insecure HTTP is not allowed for non-local host/u,
  );
});

test('normalizeApiBaseUrl rejects credentials, unsupported schemes, and malformed URLs', () => {
  assert.throws(() => normalizeApiBaseUrl('http://user:pass@localhost:5000'), /must not contain credentials/u);
  assert.throws(() => normalizeApiBaseUrl('ws://localhost:5000'), /Unsupported protocol/u);
  assert.throws(() => normalizeApiBaseUrl('not-a-url'), /Invalid API base URL/u);
  assert.throws(() => normalizeApiBaseUrl(''), /must be a non-empty string/u);
  assert.throws(() => normalizeApiBaseUrl(null), /must be a non-empty string/u);
});

test('getStatus returns unpaired status when storage is empty', async () => {
  const storage = createMockStorage();
  const client = createDeviceClient({ storage });
  const status = await client.getStatus();

  assert.deepEqual(status, {
    isPaired: false,
    pairingStatus: 'unpaired',
    deviceId: null,
    deviceName: null,
    childProfileId: null,
    platform: null,
    pairedAt: null,
    lastSeenAt: null,
    lastHeartbeatAt: null,
    lastHeartbeatStatus: null,
    policyVersion: null,
    acknowledgedPolicyVersion: 0,
    lastPolicySyncAt: null,
  });
  assert.equal(status.deviceCredential, undefined);
});

test('redeemPairingCode validates code format and device name', async () => {
  const storage = createMockStorage();
  const client = createDeviceClient({ storage });

  await assert.rejects(
    client.redeemPairingCode({ code: 'too-short', name: 'Chromebook' }),
    /Pairing code must be a 22-character base64url string/u,
  );
  await assert.rejects(
    client.redeemPairingCode({ code: 'INVALID_CHARACTERS!!!!', name: 'Chromebook' }),
    /Pairing code must be a 22-character base64url string/u,
  );
  await assert.rejects(
    client.redeemPairingCode({ code: 'a'.repeat(22), name: '' }),
    /Device name must be between 1 and 60 characters/u,
  );
  await assert.rejects(
    client.redeemPairingCode({ code: 'a'.repeat(22), name: 'x'.repeat(61) }),
    /Device name must be between 1 and 60 characters/u,
  );
});

test('redeemPairingCode stores credential securely and returns sanitized device status', async () => {
  const storage = createMockStorage();
  const validCode = 'ABCDEFabcdef01234567-_';
  const rawCredential = 'super-secret-device-bearer-credential-43chr';

  const mock = mockFetch(async () => {
    return jsonResponse(201, {
      ok: true,
      data: {
        device: {
          id: 'dev-123',
          name: 'Alex Chromebook',
          platform: 'linux',
          childProfileId: 'child-456',
          pairingStatus: 'paired',
          pairedAt: '2026-10-14T10:00:00.000Z',
          lastSeenAt: null,
        },
        deviceCredential: rawCredential,
      },
    });
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const status = await client.redeemPairingCode({
    code: validCode,
    name: 'Alex Chromebook',
    platform: 'linux',
  });

  // 1. Verify API request
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, `${DEFAULT_API_BASE_URL}/device-pairing/redeem`);
  assert.equal(mock.calls[0].options.method, 'POST');
  const sentBody = JSON.parse(mock.calls[0].options.body);
  assert.deepEqual(sentBody, {
    code: validCode,
    name: 'Alex Chromebook',
    platform: 'linux',
  });

  // 2. Verify returned status is sanitized (never discloses credential)
  assert.equal(status.isPaired, true);
  assert.equal(status.pairingStatus, 'paired');
  assert.equal(status.deviceId, 'dev-123');
  assert.equal(status.deviceName, 'Alex Chromebook');
  assert.equal(status.childProfileId, 'child-456');
  assert.equal(status.deviceCredential, undefined);

  // 3. Verify storage contains credential
  const stored = storage.store[DEVICE_SESSION_STORAGE_KEY];
  assert.ok(stored);
  assert.equal(stored.deviceId, 'dev-123');
  assert.equal(stored.deviceCredential, rawCredential);
  assert.equal(stored.pairingStatus, 'paired');
});

test('redeemPairingCode handles API rejection and network errors safely', async () => {
  const storage = createMockStorage();
  const validCode = 'ABCDEFabcdef01234567-_';

  // API 400 error
  const failMock = mockFetch(async () => {
    return jsonResponse(400, {
      ok: false,
      error: { message: 'Pairing code is invalid or has expired.' },
    });
  });

  const client = createDeviceClient({ storage, fetch: failMock.fn });
  await assert.rejects(
    client.redeemPairingCode({ code: validCode, name: 'Alex Chromebook' }),
    /Pairing code is invalid or has expired\./u,
  );
  assert.equal(storage.store[DEVICE_SESSION_STORAGE_KEY], undefined);

  // Network fetch failure
  const networkMock = mockFetch(async () => {
    throw new TypeError('Failed to fetch');
  });

  const networkClient = createDeviceClient({ storage, fetch: networkMock.fn });
  await assert.rejects(
    networkClient.redeemPairingCode({ code: validCode, name: 'Alex Chromebook' }),
    /Unable to contact the KidsGuard API/u,
  );
});

test('redeemPairingCode rejects malformed server responses without storing corrupt data', async () => {
  const validCode = 'ABCDEFabcdef01234567-_';

  // 1. Missing device and empty credential
  const storage1 = createMockStorage();
  const client1 = createDeviceClient({
    storage: storage1,
    fetch: mockFetch(async () => jsonResponse(201, { ok: true, data: { device: null, deviceCredential: '' } })).fn,
  });
  await assert.rejects(
    client1.redeemPairingCode({ code: validCode, name: 'Alex Chromebook' }),
    /Malformed pairing response/u,
  );
  assert.equal(storage1.store[DEVICE_SESSION_STORAGE_KEY], undefined);

  // 2. Credential is 42 characters (too short for 256-bit base64url)
  const storage2 = createMockStorage();
  const client2 = createDeviceClient({
    storage: storage2,
    fetch: mockFetch(async () => jsonResponse(201, {
      ok: true,
      data: {
        device: { id: 'dev-1', name: 'Chromebook' },
        deviceCredential: 'a'.repeat(42),
      },
    })).fn,
  });
  await assert.rejects(
    client2.redeemPairingCode({ code: validCode, name: 'Alex Chromebook' }),
    /Malformed pairing response/u,
  );
  assert.equal(storage2.store[DEVICE_SESSION_STORAGE_KEY], undefined);

  // 3. Credential contains invalid non-base64url characters (e.g. +, /, =)
  const storage3 = createMockStorage();
  const client3 = createDeviceClient({
    storage: storage3,
    fetch: mockFetch(async () => jsonResponse(201, {
      ok: true,
      data: {
        device: { id: 'dev-1', name: 'Chromebook' },
        deviceCredential: 'a'.repeat(40) + '+/=',
      },
    })).fn,
  });
  await assert.rejects(
    client3.redeemPairingCode({ code: validCode, name: 'Alex Chromebook' }),
    /Malformed pairing response/u,
  );
  assert.equal(storage3.store[DEVICE_SESSION_STORAGE_KEY], undefined);

  // 4. Whitespace-only device ID
  const storage4 = createMockStorage();
  const client4 = createDeviceClient({
    storage: storage4,
    fetch: mockFetch(async () => jsonResponse(201, {
      ok: true,
      data: {
        device: { id: '   ', name: 'Chromebook' },
        deviceCredential: 'a'.repeat(43),
      },
    })).fn,
  });
  await assert.rejects(
    client4.redeemPairingCode({ code: validCode, name: 'Alex Chromebook' }),
    /Malformed pairing response/u,
  );
  assert.equal(storage4.store[DEVICE_SESSION_STORAGE_KEY], undefined);
});

test('redeemPairingCode fails safely and reports error if storage.set throws', async () => {
  const validCode = 'ABCDEFabcdef01234567-_';
  const failingStorage = {
    store: {},
    async get(key) {
      return { [key]: this.store[key] };
    },
    async set() {
      throw new Error('QUOTA_BYTES quota exceeded');
    },
  };

  const client = createDeviceClient({
    storage: failingStorage,
    fetch: mockFetch(async () => jsonResponse(201, {
      ok: true,
      data: {
        device: { id: 'dev-123', name: 'Alex Chromebook' },
        deviceCredential: 'a'.repeat(43),
      },
    })).fn,
  });

  await assert.rejects(
    client.redeemPairingCode({ code: validCode, name: 'Alex Chromebook' }),
    /Failed to save device pairing session to extension storage/u,
  );

  const status = await client.getStatus();
  assert.equal(status.isPaired, false);
  assert.equal(status.pairingStatus, 'unpaired');
});

test('sendHeartbeat sends Bearer authorization header and updates lastSeenAt', async () => {
  const rawCredential = 'secret-device-credential-sample-token-43chr';
  const initialSession = {
    deviceId: 'dev-123',
    deviceCredential: rawCredential,
    deviceName: 'Alex Chromebook',
    platform: 'linux',
    childProfileId: 'child-456',
    pairedAt: '2026-10-14T10:00:00.000Z',
    lastSeenAt: null,
    pairingStatus: 'paired',
    lastHeartbeatAt: null,
    lastHeartbeatStatus: null,
  };
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: initialSession,
  });

  const mock = mockFetch(async () => {
    return jsonResponse(200, {
      ok: true,
      data: {
        device: {
          id: 'dev-123',
          lastSeenAt: '2026-10-14T10:15:00.000Z',
        },
      },
    });
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const result = await client.sendHeartbeat();

  // 1. Verify Bearer header
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, `${DEFAULT_API_BASE_URL}/devices/heartbeat`);
  assert.equal(mock.calls[0].options.headers.Authorization, `Bearer ${rawCredential}`);
  assert.equal(mock.calls[0].options.body, '{}');

  // 2. Verify result and sanitized device
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ok');
  assert.equal(result.device.lastSeenAt, '2026-10-14T10:15:00.000Z');
  assert.equal(result.device.deviceCredential, undefined);

  // 3. Verify storage updated
  const stored = storage.store[DEVICE_SESSION_STORAGE_KEY];
  assert.equal(stored.lastHeartbeatStatus, 'ok');
  assert.equal(stored.lastSeenAt, '2026-10-14T10:15:00.000Z');
  assert.ok(stored.lastHeartbeatAt);
});

test('sendHeartbeat handles 401 neutrally as invalid_session and preserves credentials', async () => {
  const credential = 'revoked-credential-43chars-long-base64url--';
  const initialSession = {
    deviceId: 'dev-123',
    deviceCredential: credential,
    deviceName: 'Alex Chromebook',
    platform: 'linux',
    childProfileId: 'child-456',
    pairedAt: '2026-10-14T10:00:00.000Z',
    lastSeenAt: null,
    pairingStatus: 'paired',
    lastHeartbeatAt: null,
    lastHeartbeatStatus: null,
  };
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: initialSession,
  });

  const mock = mockFetch(async () => {
    return jsonResponse(401, {
      ok: false,
      error: { message: 'Device authentication failed.' },
    });
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const result = await client.sendHeartbeat();

  // 1. Neutral invalid_session status returned, no accusation of parent revocation
  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_session');
  assert.equal(result.error, 'Device session is invalid or expired. Re-pairing is required.');

  // 2. Storage updated to invalid_session but deviceCredential remains available for explicit reset/re-pair
  const stored = storage.store[DEVICE_SESSION_STORAGE_KEY];
  assert.equal(stored.pairingStatus, 'invalid_session');
  assert.equal(stored.lastHeartbeatStatus, 'invalid_session');
  assert.equal(stored.deviceCredential, credential);

  // 3. Subsequent heartbeats return invalid_session immediately without network requests
  mock.calls.length = 0;
  const subsequent = await client.sendHeartbeat();
  assert.equal(subsequent.ok, false);
  assert.equal(subsequent.status, 'invalid_session');
  assert.equal(mock.calls.length, 0);
});

test('sendHeartbeat handles offline network failure gracefully without clearing credentials', async () => {
  const initialSession = {
    deviceId: 'dev-123',
    deviceCredential: 'valid-credential-43chars-long-base64url-----',
    deviceName: 'Alex Chromebook',
    platform: 'linux',
    childProfileId: 'child-456',
    pairedAt: '2026-10-14T10:00:00.000Z',
    lastSeenAt: null,
    pairingStatus: 'paired',
    lastHeartbeatAt: null,
    lastHeartbeatStatus: null,
  };
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: initialSession,
  });

  const mock = mockFetch(async () => {
    throw new TypeError('Network request failed');
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const result = await client.sendHeartbeat();

  assert.equal(result.ok, false);
  assert.equal(result.status, 'offline');
  assert.match(result.error, /Network unavailable/u);

  const stored = storage.store[DEVICE_SESSION_STORAGE_KEY];
  assert.equal(stored.pairingStatus, 'paired'); // Credentials and paired status preserved!
  assert.equal(stored.deviceCredential, 'valid-credential-43chars-long-base64url-----');
  assert.equal(stored.lastHeartbeatStatus, 'offline');
});

test('clearSession removes device session from storage and returns sanitized status', async () => {
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: {
      deviceId: 'dev-123',
      deviceCredential: 'some-credential',
      deviceName: 'Device',
      pairingStatus: 'paired',
    },
  });

  const client = createDeviceClient({ storage });
  const status = await client.clearSession();

  assert.equal(status.isPaired, false);
  assert.equal(status.pairingStatus, 'unpaired');
  assert.equal(storage.store[DEVICE_SESSION_STORAGE_KEY], null);
});

test('secrets are not leaked through thrown errors, returned values, or status payloads', async () => {
  const secretToken = 'super-secret-token-value-43characters-long';
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: {
      deviceId: 'dev-123',
      deviceCredential: secretToken,
      deviceName: 'Device',
      pairingStatus: 'paired',
    },
  });

  const client = createDeviceClient({
    storage,
    fetch: mockFetch(async () => jsonResponse(200, {
      ok: true,
      data: { device: { id: 'dev-123', lastSeenAt: '2026-10-14T10:00:00.000Z' } },
    })).fn,
  });

  // 1. getStatus() contains no credentials or secret substrings
  const status = await client.getStatus();
  assert.equal(JSON.stringify(status).includes(secretToken), false);
  assert.equal(status.deviceCredential, undefined);

  // 2. sendHeartbeat() returned device contains no credentials
  const hb = await client.sendHeartbeat();
  assert.equal(JSON.stringify(hb).includes(secretToken), false);
  assert.equal(hb.device.deviceCredential, undefined);

  // 3. normalizeApiBaseUrl does not echo credentials if passed in URL
  assert.throws(
    () => normalizeApiBaseUrl(`https://user:${secretToken}@example.com`),
    (err) => {
      assert.equal(err.message.includes(secretToken), false);
      return /must not contain credentials/u.test(err.message);
    },
  );

  // 4. Invalid pairing code rejects without echoing code in message
  const sensitiveCode = 'MY_PRIVATE_PAIRING_CODE';
  await assert.rejects(
    client.redeemPairingCode({ code: sensitiveCode, name: 'Alex Chromebook' }),
    (err) => {
      assert.equal(err.message.includes(sensitiveCode), false);
      return true;
    },
  );
});

test('fetchPolicy returns policy and updates lastPolicySyncAt and acknowledgedPolicyVersion', async () => {
  const rawCredential = 'secret-device-credential-sample-token-43chr';
  const initialSession = {
    deviceId: 'dev-123',
    deviceCredential: rawCredential,
    deviceName: 'Alex Chromebook',
    pairingStatus: 'paired',
    acknowledgedPolicyVersion: 1,
  };
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: initialSession,
  });

  const mock = mockFetch(async () => {
    return jsonResponse(200, {
      ok: true,
      data: {
        policy: {
          version: 3,
          webRestrictions: {
            enabled: true,
            blockedDomains: ['bad.example', 'social.example'],
          },
        },
      },
    });
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const result = await client.fetchPolicy();

  // 1. Verify Bearer header and endpoint
  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, `${DEFAULT_API_BASE_URL}/devices/policy`);
  assert.equal(mock.calls[0].options.headers.Authorization, `Bearer ${rawCredential}`);

  // 2. Verify returned result
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ok');
  assert.equal(result.policy.version, 3);
  assert.deepEqual(result.policy.webRestrictions.blockedDomains, ['bad.example', 'social.example']);

  // 3. Verify storage session updated
  const stored = storage.store[DEVICE_SESSION_STORAGE_KEY];
  assert.equal(stored.policyVersion, 3);
  assert.ok(stored.lastPolicySyncAt);
});

test('fetchPolicy handles 401 neutrally as invalid_session and preserves credentials', async () => {
  const credential = 'revoked-credential-43chars-long-base64url--';
  const initialSession = {
    deviceId: 'dev-123',
    deviceCredential: credential,
    pairingStatus: 'paired',
  };
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: initialSession,
  });

  const mock = mockFetch(async () => {
    return jsonResponse(401, {
      ok: false,
      error: { message: 'Device authentication failed.' },
    });
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const result = await client.fetchPolicy();

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_session');
  assert.match(result.error, /invalid or expired/u);

  const stored = storage.store[DEVICE_SESSION_STORAGE_KEY];
  assert.equal(stored.pairingStatus, 'invalid_session');
  assert.equal(stored.deviceCredential, credential);
});

test('acknowledgePolicy sends version and updates session acknowledgedPolicyVersion', async () => {
  const rawCredential = 'secret-device-credential-sample-token-43chr';
  const initialSession = {
    deviceId: 'dev-123',
    deviceCredential: rawCredential,
    pairingStatus: 'paired',
    acknowledgedPolicyVersion: 1,
  };
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: initialSession,
  });

  const mock = mockFetch(async () => {
    return jsonResponse(200, {
      ok: true,
      data: { acknowledged: true, version: 4 },
    });
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const result = await client.acknowledgePolicy(4);

  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, `${DEFAULT_API_BASE_URL}/devices/policy/ack`);
  assert.equal(mock.calls[0].options.headers.Authorization, `Bearer ${rawCredential}`);
  const sent = JSON.parse(mock.calls[0].options.body);
  assert.deepEqual(sent, { acknowledgedVersion: 4 });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ok');

  const stored = storage.store[DEVICE_SESSION_STORAGE_KEY];
  assert.equal(stored.acknowledgedPolicyVersion, 4);
});

test('sendWebHistory sends Bearer authorization header and uploads visits payload', async () => {
  const rawCredential = 'secret-device-credential-sample-token-43chr';
  const initialSession = {
    deviceId: 'dev-123',
    deviceCredential: rawCredential,
    pairingStatus: 'paired',
  };
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: initialSession,
  });

  const mock = mockFetch(async () => {
    return jsonResponse(200, {
      ok: true,
      data: { ingestedCount: 2 },
    });
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const sampleVisits = [
    { url: 'https://en.wikipedia.org/wiki/Science', title: 'Science - Wikipedia', domain: 'en.wikipedia.org', visitedAt: '2026-10-24T12:00:00.000Z', visitCount: 3, isBlocked: false },
    { url: 'https://khanacademy.org/math', title: 'Math | Khan Academy', domain: 'khanacademy.org', visitedAt: '2026-10-24T12:05:00.000Z', visitCount: 1, isBlocked: false },
  ];

  const result = await client.sendWebHistory(sampleVisits);

  assert.equal(mock.calls.length, 1);
  assert.equal(mock.calls[0].url, `${DEFAULT_API_BASE_URL}/devices/web-history`);
  assert.equal(mock.calls[0].options.headers.Authorization, `Bearer ${rawCredential}`);
  const sent = JSON.parse(mock.calls[0].options.body);
  assert.deepEqual(sent.visits, sampleVisits);

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ok');
  assert.equal(result.ingestedCount, 2);
});

test('sendWebHistory returns noop for empty visits list', async () => {
  const client = createDeviceClient({ storage: createMockStorage() });
  const result = await client.sendWebHistory([]);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'noop');
  assert.equal(result.ingestedCount, 0);
});

test('sendWebHistory handles 401 neutrally as invalid_session', async () => {
  const rawCredential = 'revoked-device-credential-43chars-long-base64';
  const initialSession = {
    deviceId: 'dev-123',
    deviceCredential: rawCredential,
    pairingStatus: 'paired',
  };
  const storage = createMockStorage({
    [DEVICE_SESSION_STORAGE_KEY]: initialSession,
  });

  const mock = mockFetch(async () => {
    return jsonResponse(401, {
      ok: false,
      error: { message: 'Invalid or revoked device credential.' },
    });
  });

  const client = createDeviceClient({ storage, fetch: mock.fn });
  const result = await client.sendWebHistory([
    { url: 'https://example.com', title: 'Example', visitedAt: '2026-10-24T12:00:00.000Z' },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.status, 'invalid_session');
  assert.equal(storage.store[DEVICE_SESSION_STORAGE_KEY].pairingStatus, 'invalid_session');
});

