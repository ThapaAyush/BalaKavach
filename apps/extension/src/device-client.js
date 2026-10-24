export const DEFAULT_API_BASE_URL = 'http://localhost:5000/api/v1';
export const DEFAULT_CLOUD_API_BASE_URL = 'https://balakavach-be.onrender.com/api/v1';
export const DEVICE_SESSION_STORAGE_KEY = 'kidsguard_device_session';
export const CONFIG_API_BASE_URL_KEY = 'kidsguard_api_base_url';

const VALID_PLATFORMS = new Set(['android', 'ios', 'windows', 'macos', 'linux', 'unknown']);

export function normalizeApiBaseUrl(rawUrl = DEFAULT_API_BASE_URL) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new TypeError('API base URL must be a non-empty string.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new TypeError('Invalid API base URL.');
  }

  if (parsed.username || parsed.password) {
    throw new TypeError('API base URL must not contain credentials.');
  }

  const protocol = parsed.protocol;
  const hostname = parsed.hostname;

  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

  if (protocol === 'http:') {
    if (!isLocalhost) {
      throw new TypeError(`Insecure HTTP is not allowed for non-local host '${hostname}'. HTTPS is required.`);
    }
  } else if (protocol !== 'https:') {
    throw new TypeError(`Unsupported protocol '${protocol}'. Only HTTPS (or local HTTP) is permitted.`);
  }

  const rawPath = parsed.pathname.replace(/\/+$/u, '');
  const pathPart = (!rawPath || rawPath === '/') ? '/api/v1' : rawPath;
  return `${parsed.origin}${pathPart}`;
}

export function sanitizeDeviceStatus(session) {
  if (!session || !session.deviceId) {
    return {
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
      acknowledgedPolicyVersion: 0,
      lastPolicySyncAt: null,
      policyVersion: null,
    };
  }

  const result = {
    isPaired: session.pairingStatus === 'paired',
    pairingStatus: session.pairingStatus,
    deviceId: session.deviceId,
    deviceName: session.deviceName,
    childProfileId: session.childProfileId,
    platform: session.platform,
    pairedAt: session.pairedAt,
    lastSeenAt: session.lastSeenAt ?? null,
    lastHeartbeatAt: session.lastHeartbeatAt ?? null,
    lastHeartbeatStatus: session.lastHeartbeatStatus ?? null,
    acknowledgedPolicyVersion: session.acknowledgedPolicyVersion ?? 0,
    lastPolicySyncAt: session.lastPolicySyncAt ?? null,
    policyVersion: session.policyVersion ?? null,
  };

  if (session.apiBaseUrl) {
    result.apiBaseUrl = session.apiBaseUrl;
  }

  return result;
}

export function createDeviceClient({
  storage = typeof chrome !== 'undefined' ? chrome.storage?.local : undefined,
  fetch = globalThis.fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
} = {}) {
  const fallbackBaseUrl = normalizeApiBaseUrl(apiBaseUrl);

  async function getStoredSession() {
    try {
      const data = await storage.get(DEVICE_SESSION_STORAGE_KEY);
      return data?.[DEVICE_SESSION_STORAGE_KEY] ?? null;
    } catch {
      return null;
    }
  }

  async function saveStoredSession(session) {
    await storage.set({ [DEVICE_SESSION_STORAGE_KEY]: session });
  }

  async function resolveBaseUrl(explicitUrl) {
    if (typeof explicitUrl === 'string' && explicitUrl.trim()) {
      return normalizeApiBaseUrl(explicitUrl);
    }
    const session = await getStoredSession();
    if (session?.apiBaseUrl) {
      return normalizeApiBaseUrl(session.apiBaseUrl);
    }
    try {
      const data = await storage.get(CONFIG_API_BASE_URL_KEY);
      if (data?.[CONFIG_API_BASE_URL_KEY]) {
        return normalizeApiBaseUrl(data[CONFIG_API_BASE_URL_KEY]);
      }
    } catch {
      // ignore
    }
    return fallbackBaseUrl;
  }

  return {
    async getStatus() {
      const session = await getStoredSession();
      return sanitizeDeviceStatus(session);
    },

    async getApiBaseUrl() {
      return await resolveBaseUrl();
    },

    async setApiBaseUrl(newUrl) {
      const normalized = normalizeApiBaseUrl(newUrl);
      await storage.set({ [CONFIG_API_BASE_URL_KEY]: normalized });
      const session = await getStoredSession();
      if (session) {
        session.apiBaseUrl = normalized;
        await saveStoredSession(session);
      }
      return normalized;
    },

    async redeemPairingCode({ code, name, platform = 'unknown', apiBaseUrl: explicitUrl } = {}) {
      if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{22}$/u.test(code.trim())) {
        throw new TypeError('Pairing code must be a 22-character base64url string.');
      }
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) {
        throw new TypeError('Device name must be between 1 and 60 characters.');
      }

      const currentBaseUrl = await resolveBaseUrl(explicitUrl);
      const safePlatform = VALID_PLATFORMS.has(platform) ? platform : 'unknown';
      const requestBody = JSON.stringify({
        code: code.trim(),
        name: name.trim(),
        platform: safePlatform,
      });

      let response;
      try {
        response = await fetch(`${currentBaseUrl}/device-pairing/redeem`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: requestBody,
        });
      } catch (networkErr) {
        console.error('[KidsGuard] Device pairing network error:', networkErr);
        throw new Error('Unable to contact the KidsGuard API. Check your connection and retry.');
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message = payload?.error?.message ?? `Pairing failed (${response.status}).`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
      }

      const device = payload?.data?.device;
      const deviceCredential = payload?.data?.deviceCredential;
      const isValidCredential = typeof deviceCredential === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(deviceCredential);

      if (
        !device ||
        typeof device !== 'object' ||
        Array.isArray(device) ||
        typeof device.id !== 'string' ||
        !device.id.trim() ||
        !isValidCredential
      ) {
        throw new Error('Malformed pairing response received from the server.');
      }

      const session = {
        deviceId: device.id.trim(),
        deviceCredential,
        deviceName: typeof device.name === 'string' && device.name.trim() ? device.name.trim() : name.trim(),
        platform: typeof device.platform === 'string' && VALID_PLATFORMS.has(device.platform) ? device.platform : safePlatform,
        childProfileId: typeof device.childProfileId === 'string' && device.childProfileId.trim() ? device.childProfileId.trim() : null,
        pairedAt: typeof device.pairedAt === 'string' && device.pairedAt.trim() ? device.pairedAt.trim() : new Date().toISOString(),
        lastSeenAt: typeof device.lastSeenAt === 'string' && device.lastSeenAt.trim() ? device.lastSeenAt.trim() : null,
        pairingStatus: 'paired',
        lastHeartbeatAt: null,
        lastHeartbeatStatus: null,
        acknowledgedPolicyVersion: 0,
        lastPolicySyncAt: null,
        policyVersion: null,
        apiBaseUrl: currentBaseUrl,
      };

      try {
        await storage.set({
          [CONFIG_API_BASE_URL_KEY]: currentBaseUrl,
          [DEVICE_SESSION_STORAGE_KEY]: session,
        });
      } catch {
        throw new Error('Failed to save device pairing session to extension storage.');
      }

      return sanitizeDeviceStatus(session);
    },

    async sendHeartbeat() {
      const session = await getStoredSession();
      if (!session || !session.deviceCredential) {
        return {
          ok: false,
          status: 'unpaired',
          error: 'Device is not paired.',
        };
      }

      if (session.pairingStatus === 'invalid_session') {
        return {
          ok: false,
          status: 'invalid_session',
          error: 'Device session is invalid or expired. Re-pairing is required.',
        };
      }

      const currentBaseUrl = await resolveBaseUrl();
      let response;
      try {
        response = await fetch(`${currentBaseUrl}/devices/heartbeat`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.deviceCredential}`,
          },
          body: '{}',
        });
      } catch {
        session.lastHeartbeatStatus = 'offline';
        try {
          await saveStoredSession(session);
        } catch {
          // Ignore storage write failure while offline
        }
        return {
          ok: false,
          status: 'offline',
          error: 'Network unavailable. Heartbeat will retry later.',
        };
      }

      if (response.status === 401) {
        session.pairingStatus = 'invalid_session';
        session.lastHeartbeatStatus = 'invalid_session';
        try {
          await saveStoredSession(session);
        } catch {
          // Ignore storage write failure on invalid session
        }
        return {
          ok: false,
          status: 'invalid_session',
          error: 'Device session is invalid or expired. Re-pairing is required.',
        };
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        session.lastHeartbeatStatus = 'error';
        try {
          await saveStoredSession(session);
        } catch {
          // Ignore storage write failure on HTTP error
        }
        return {
          ok: false,
          status: 'error',
          error: payload?.error?.message ?? `Heartbeat failed (${response.status}).`,
        };
      }

      const updatedDevice = payload?.data?.device;
      session.lastSeenAt = typeof updatedDevice?.lastSeenAt === 'string' && updatedDevice.lastSeenAt.trim()
        ? updatedDevice.lastSeenAt.trim()
        : new Date().toISOString();
      session.lastHeartbeatAt = new Date().toISOString();
      session.lastHeartbeatStatus = 'ok';
      try {
        await saveStoredSession(session);
      } catch {
        return {
          ok: false,
          status: 'error',
          error: 'Heartbeat succeeded on server but failed to update local storage.',
        };
      }

      return {
        ok: true,
        status: 'ok',
        device: sanitizeDeviceStatus(session),
      };
    },

    async fetchPolicy() {
      const session = await getStoredSession();
      if (!session || !session.deviceCredential) {
        return {
          ok: false,
          status: 'unpaired',
          error: 'Device is not paired.',
        };
      }

      if (session.pairingStatus === 'invalid_session') {
        return {
          ok: false,
          status: 'invalid_session',
          error: 'Device session is invalid or expired. Re-pairing is required.',
        };
      }

      const currentBaseUrl = await resolveBaseUrl();
      let response;
      try {
        response = await fetch(`${currentBaseUrl}/devices/policy`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${session.deviceCredential}`,
          },
        });
      } catch {
        return {
          ok: false,
          status: 'offline',
          error: 'Network unavailable. Policy sync will retry later.',
        };
      }

      if (response.status === 401) {
        session.pairingStatus = 'invalid_session';
        session.lastHeartbeatStatus = 'invalid_session';
        try {
          await saveStoredSession(session);
        } catch {
          // Ignore storage write failure on invalid session
        }
        return {
          ok: false,
          status: 'invalid_session',
          error: 'Device session is invalid or expired. Re-pairing is required.',
        };
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: 'error',
          error: payload?.error?.message ?? `Policy fetch failed (${response.status}).`,
        };
      }

      const data = payload?.data;
      const policyVersion = typeof data?.policyVersion === 'number'
        ? data.policyVersion
        : (typeof data?.policy?.version === 'number' ? data.policy.version : null);

      if (policyVersion === null) {
        return {
          ok: false,
          status: 'error',
          error: 'Malformed policy payload received from server.',
        };
      }

      session.policyVersion = policyVersion;
      session.lastPolicySyncAt = new Date().toISOString();
      try {
        await saveStoredSession(session);
      } catch {
        // Non-critical
      }

      const policy = data.policy ?? {
        version: policyVersion,
        screenTime: data.screenTime,
        webRestrictions: data.webRestrictions,
      };
      if (typeof policy.version !== 'number') {
        policy.version = policyVersion;
      }

      return {
        ok: true,
        status: 'ok',
        policyVersion,
        policy,
      };
    },

    async acknowledgePolicy(version) {
      if (typeof version !== 'number' || version < 1) {
        throw new TypeError('Acknowledged version must be a positive integer.');
      }

      const session = await getStoredSession();
      if (!session || !session.deviceCredential) {
        return {
          ok: false,
          status: 'unpaired',
          error: 'Device is not paired.',
        };
      }

      if (session.pairingStatus === 'invalid_session') {
        return {
          ok: false,
          status: 'invalid_session',
          error: 'Device session is invalid or expired. Re-pairing is required.',
        };
      }

      const currentBaseUrl = await resolveBaseUrl();
      let response;
      try {
        response = await fetch(`${currentBaseUrl}/devices/policy/ack`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.deviceCredential}`,
          },
          body: JSON.stringify({ acknowledgedVersion: version }),
        });
      } catch {
        return {
          ok: false,
          status: 'offline',
          error: 'Network unavailable. Policy acknowledgment will retry later.',
        };
      }

      if (response.status === 401) {
        session.pairingStatus = 'invalid_session';
        session.lastHeartbeatStatus = 'invalid_session';
        try {
          await saveStoredSession(session);
        } catch {
          // Ignore storage write failure on invalid session
        }
        return {
          ok: false,
          status: 'invalid_session',
          error: 'Device session is invalid or expired. Re-pairing is required.',
        };
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: 'error',
          error: payload?.error?.message ?? `Policy acknowledgment failed (${response.status}).`,
        };
      }

      const ackData = payload?.data;
      const now = new Date().toISOString();
      session.acknowledgedPolicyVersion = ackData?.acknowledgedVersion ?? version;
      session.lastPolicySyncAt = ackData?.syncedAt ?? now;

      try {
        await saveStoredSession(session);
      } catch {
        // Non-critical
      }

      return {
        ok: true,
        status: 'ok',
        acknowledgedVersion: session.acknowledgedPolicyVersion,
        syncedAt: session.lastPolicySyncAt,
      };
    },

    async sendWebHistory(visits) {
      if (!Array.isArray(visits) || visits.length === 0) {
        return { ok: true, status: 'noop', ingestedCount: 0 };
      }

      const session = await getStoredSession();
      if (!session || !session.deviceCredential) {
        return {
          ok: false,
          status: 'unpaired',
          error: 'Device is not paired.',
        };
      }

      if (session.pairingStatus === 'invalid_session') {
        return {
          ok: false,
          status: 'invalid_session',
          error: 'Device session is invalid or expired. Re-pairing is required.',
        };
      }

      const currentBaseUrl = await resolveBaseUrl();
      let response;
      try {
        response = await fetch(`${currentBaseUrl}/devices/web-history`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.deviceCredential}`,
          },
          body: JSON.stringify({ visits }),
        });
      } catch {
        return {
          ok: false,
          status: 'offline',
          error: 'Network unavailable. History sync will retry later.',
        };
      }

      if (response.status === 401) {
        session.pairingStatus = 'invalid_session';
        session.lastHeartbeatStatus = 'invalid_session';
        try {
          await saveStoredSession(session);
        } catch {
          // Ignore storage write failure on invalid session
        }
        return {
          ok: false,
          status: 'invalid_session',
          error: 'Device session is invalid or expired. Re-pairing is required.',
        };
      }

      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: 'error',
          error: payload?.error?.message ?? `Web history upload failed (${response.status}).`,
        };
      }

      return {
        ok: true,
        status: 'ok',
        ingestedCount: payload?.data?.ingestedCount ?? visits.length,
      };
    },

    async clearSession() {
      await storage.set({ [DEVICE_SESSION_STORAGE_KEY]: null });
      return sanitizeDeviceStatus(null);
    },
  };
}
