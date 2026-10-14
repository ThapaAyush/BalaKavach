import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

const parent = { id: 'parent-id', email: 'parent@example.com' };

function response(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KidsGuard web foundation', () => {
  it('shows API and database status and an unauthenticated parent form', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/health')) {
        return response(200, {
          ok: true,
          data: { status: 'degraded', dependencies: { mongodb: 'disconnected' } },
        });
      }
      return response(401, { ok: false, error: { message: 'Authentication required.' } });
    }));

    render(<App />);

    expect(await screen.findByText('API available')).toBeInTheDocument();
    expect(screen.getByText(/MongoDB disconnected/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
  });

  it('shows a clear unavailable state when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<App />);

    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Start the API at localhost:5000/)).toBeInTheDocument();
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
  });

  it('shows loading and empty child-profile states while authenticated', async () => {
    let resolveChildren;
    const childrenResponse = new Promise((resolve) => { resolveChildren = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children')) return childrenResponse;
      if (path.endsWith('/devices')) return response(200, { ok: true, data: { devices: [] } });
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<App />);
    expect(await screen.findByText('Loading child profiles…')).toBeInTheDocument();

    await act(async () => {
      resolveChildren(response(200, { ok: true, data: { children: [] } }));
      await childrenResponse;
    });
    expect(await screen.findByText('No child profiles yet.')).toBeInTheDocument();
    expect(await screen.findByText('No paired devices yet.')).toBeInTheDocument();
  });

  it('shows child-profile API and validation failures without claiming success', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(503, { ok: false, error: { message: 'Child profiles are temporarily unavailable.' } });
      }
      if (path.endsWith('/children') && options.method === 'POST') {
        return response(400, { ok: false, error: { message: 'Invalid request body.' } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText('Child profiles could not be loaded. Try again later.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add child profile' }));

    expect(await screen.findByText('Invalid request body.')).toBeInTheDocument();
    expect(screen.queryByText('Child profile created.')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Saved child profiles' })).not.toBeInTheDocument();
  });

  it('registers, signs in with a cookie-backed request, and logs out', async () => {
    let signedIn = false;
    let childProfiles = [];
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) {
        return response(200, {
          ok: true,
          data: { status: 'ready', dependencies: { mongodb: 'connected' } },
        });
      }
      if (path.endsWith('/auth/me')) {
        return signedIn
          ? response(200, { ok: true, data: { parent } })
          : response(401, { ok: false, error: { message: 'Authentication required.' } });
      }
      if (path.endsWith('/auth/register')) {
        return response(202, {
          ok: true,
          data: { message: 'Registration request received. You can try signing in.' },
        });
      }
      if (path.endsWith('/auth/login')) {
        signedIn = true;
        return response(200, { ok: true, data: { parent } });
      }
      if (path.endsWith('/auth/logout')) {
        signedIn = false;
        return response(204);
      }
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: childProfiles } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children') && options.method === 'POST') {
        const input = JSON.parse(options.body);
        const child = { id: 'child-1', ...input };
        childProfiles = [...childProfiles, child];
        return response(201, { ok: true, data: { child } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await screen.findByRole('group', { name: 'Authentication options' });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'parent@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secure parent password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Registration request received. You can try signing in.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secure parent password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('parent@example.com')).toBeInTheDocument();
    expect(await screen.findByText('No child profiles yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add child profile' }));
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(await screen.findByText('Child profile created.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    const authCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/'));
    expect(authCalls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/v1/auth/me',
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
    ]);
    for (const [, options] of authCalls) expect(options.credentials).toBe('include');
    const childCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/children'));
    expect(childCalls.map(([, options]) => options.method)).toEqual(['GET', 'POST']);
    for (const [, options] of childCalls) expect(options.credentials).toBe('include');
    expect(JSON.parse(childCalls[1][1].body)).toEqual({ displayName: 'Alex' });
    expect(JSON.parse(authCalls[1][1].body)).toEqual({
      email: 'parent@example.com',
      password: 'secure parent password',
    });
    expect(signedIn).toBe(false);
  });

  it('generates, displays in memory, and cancels a pairing code for an owned child', async () => {
    let pairingCodeActive = false;
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: [{ id: 'child-1', displayName: 'Alex' }] } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children/child-1/pairing-codes') && options.method === 'POST') {
        pairingCodeActive = true;
        return response(201, {
          ok: true,
          data: {
            pairingCode: {
              id: 'code-1',
              code: 'TEST-PAIRING-CODE-22CH',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          },
        });
      }
      if (path.endsWith('/children/child-1/pairing-codes/code-1') && options.method === 'DELETE') {
        pairingCodeActive = false;
        return response(204);
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText('Alex')).toBeInTheDocument();

    const pairButton = screen.getByRole('button', { name: 'Pair a device for Alex' });
    fireEvent.click(pairButton);

    expect(await screen.findByText('TEST-PAIRING-CODE-22CH')).toBeInTheDocument();
    expect(screen.getByText(/Kept in memory only; not stored in browser storage\./)).toBeInTheDocument();
    expect(pairingCodeActive).toBe(true);

    const cancelButton = screen.getByRole('button', { name: 'Cancel code' });
    fireEvent.click(cancelButton);

    expect(await screen.findByText('Pairing code cancelled.')).toBeInTheDocument();
    expect(screen.queryByText('TEST-PAIRING-CODE-22CH')).not.toBeInTheDocument();
    expect(pairingCodeActive).toBe(false);
  });

  it('displays expired pairing code state when time elapses and allows dismissing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: [{ id: 'child-1', displayName: 'Alex' }] } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children/child-1/pairing-codes') && options.method === 'POST') {
        return response(201, {
          ok: true,
          data: {
            pairingCode: {
              id: 'code-expired',
              code: 'EXPIRED-CODE-12345678',
              expiresAt: new Date(Date.now() - 1000).toISOString(),
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<App />);
    expect(await screen.findByText('Alex')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pair a device for Alex' }));

    expect(await screen.findByText('Pairing code expired.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Pairing code expired.')).not.toBeInTheDocument();
  });

  it('lists paired devices and allows revoking an active device', async () => {
    let devices = [
      {
        id: 'dev-1',
        childProfileId: 'child-1',
        name: "Alex's Tablet",
        platform: 'android',
        pairingStatus: 'paired',
        pairedAt: '2026-10-14T00:00:00.000Z',
        lastSeenAt: '2026-10-14T10:00:00.000Z',
        enforcementStatus: 'not_implemented',
      },
    ];

    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: [{ id: 'child-1', displayName: 'Alex' }] } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices } });
      }
      if (path.endsWith('/devices/dev-1') && options.method === 'DELETE') {
        devices = devices.map((d) => ({ ...d, pairingStatus: 'revoked', revokedAt: new Date().toISOString() }));
        return response(204);
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText("Alex's Tablet")).toBeInTheDocument();
    expect(screen.getByText('Paired')).toBeInTheDocument();
    expect(screen.getByText(/Child: Alex • Platform: android/)).toBeInTheDocument();
    expect(screen.getByText(/Paired:/)).toBeInTheDocument();
    expect(screen.getByText('Device filtering enforcement is not implemented in this stage.')).toBeInTheDocument();

    const revokeButton = screen.getByRole('button', { name: "Revoke Alex's Tablet" });
    fireEvent.click(revokeButton);

    expect(await screen.findByText('Device access revoked.')).toBeInTheDocument();
    expect(await screen.findByText('Revoked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Revoke Alex's Tablet" })).not.toBeInTheDocument();
  });

  it('clears or replaces pairing code when switching child context or signing out', async () => {
    const childrenList = [
      { id: 'child-1', displayName: 'Alex' },
      { id: 'child-2', displayName: 'Sam' },
    ];
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/auth/logout')) return response(204);
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: childrenList } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children/child-1/pairing-codes') && options.method === 'POST') {
        return response(201, {
          ok: true,
          data: {
            pairingCode: {
              id: 'code-1',
              code: 'ALEX-CODE-1111111111',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          },
        });
      }
      if (path.endsWith('/children/child-2/pairing-codes') && options.method === 'POST') {
        return response(201, {
          ok: true,
          data: {
            pairingCode: {
              id: 'code-2',
              code: 'SAM-CODE-22222222222',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pair a device for Alex' }));
    expect(await screen.findByText('ALEX-CODE-1111111111')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pair a device for Sam' }));
    expect(await screen.findByText('SAM-CODE-22222222222')).toBeInTheDocument();
    expect(screen.queryByText('ALEX-CODE-1111111111')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());
    expect(screen.queryByText('SAM-CODE-22222222222')).not.toBeInTheDocument();
  });

  it('refreshes paired devices list on demand', async () => {
    let deviceCallCount = 0;
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children')) return response(200, { ok: true, data: { children: [] } });
      if (path.endsWith('/devices') && options.method === 'GET') {
        deviceCallCount += 1;
        if (deviceCallCount === 1) {
          return response(200, { ok: true, data: { devices: [] } });
        }
        return response(200, {
          ok: true,
          data: {
            devices: [
              {
                id: 'dev-new',
                childProfileId: 'child-1',
                name: 'New Chromebook',
                platform: 'chromeos',
                pairingStatus: 'paired',
                pairedAt: '2026-10-14T02:00:00.000Z',
                lastSeenAt: null,
                enforcementStatus: 'not_implemented',
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText('No paired devices yet.')).toBeInTheDocument();

    const refreshButton = screen.getByRole('button', { name: 'Refresh paired devices' });
    fireEvent.click(refreshButton);

    expect(await screen.findByText('New Chromebook')).toBeInTheDocument();
    expect(deviceCallCount).toBe(2);
  });

  it('shows error state when devices API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children')) return response(200, { ok: true, data: { children: [] } });
      if (path.endsWith('/devices')) return response(503, { ok: false, error: { message: 'Devices unavailable.' } });
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<App />);
    expect(await screen.findByText('Paired devices could not be loaded. Try again later.')).toBeInTheDocument();
  });

  it('does not display a stale pairing code if API response arrives after signing out', async () => {
    let resolvePairingCode;
    const pairingPromise = new Promise((resolve) => { resolvePairingCode = resolve; });
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/auth/logout')) return response(204);
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: [{ id: 'child-1', displayName: 'Alex' }] } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children/child-1/pairing-codes') && options.method === 'POST') {
        return pairingPromise;
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText('Alex')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pair a device for Alex' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeInTheDocument());

    await act(async () => {
      resolvePairingCode(response(201, {
        ok: true,
        data: {
          pairingCode: {
            id: 'late-code',
            code: 'LATE-CODE-1234567890',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        },
      }));
      await pairingPromise;
    });

    expect(screen.queryByText('LATE-CODE-1234567890')).not.toBeInTheDocument();
  });

  it('does not allow a slow pairing code response to overwrite a newer child code', async () => {
    let resolveAlex;
    const alexPromise = new Promise((resolve) => { resolveAlex = resolve; });
    const childrenList = [
      { id: 'child-1', displayName: 'Alex' },
      { id: 'child-2', displayName: 'Sam' },
    ];
    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: childrenList } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children/child-1/pairing-codes') && options.method === 'POST') {
        return alexPromise;
      }
      if (path.endsWith('/children/child-2/pairing-codes') && options.method === 'POST') {
        return response(201, {
          ok: true,
          data: {
            pairingCode: {
              id: 'code-sam',
              code: 'FAST-SAM-CODE-22222',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pair a device for Alex' }));

    fireEvent.click(screen.getByRole('button', { name: 'Pair a device for Sam' }));
    expect(await screen.findByText('FAST-SAM-CODE-22222')).toBeInTheDocument();

    await act(async () => {
      resolveAlex(response(201, {
        ok: true,
        data: {
          pairingCode: {
            id: 'code-alex',
            code: 'SLOW-ALEX-CODE-1111',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        },
      }));
      await alexPromise;
    });

    expect(screen.getByText('FAST-SAM-CODE-22222')).toBeInTheDocument();
    expect(screen.queryByText('SLOW-ALEX-CODE-1111')).not.toBeInTheDocument();
  });

  it('handles pairing-code cancellation and device revocation failures honestly without showing false success', async () => {
    const devices = [
      {
        id: 'dev-1',
        childProfileId: 'child-1',
        name: "Alex's Tablet",
        platform: 'android',
        pairingStatus: 'paired',
        pairedAt: '2026-10-14T00:00:00.000Z',
        lastSeenAt: null,
        enforcementStatus: 'not_implemented',
      },
    ];

    const fetchMock = vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: [{ id: 'child-1', displayName: 'Alex' }] } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices } });
      }
      if (path.endsWith('/children/child-1/pairing-codes') && options.method === 'POST') {
        return response(201, {
          ok: true,
          data: {
            pairingCode: {
              id: 'code-cancel-fail',
              code: 'ACTIVE-CODE-NOT-REVOKED',
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
            },
          },
        });
      }
      if (path.endsWith('/children/child-1/pairing-codes/code-cancel-fail') && options.method === 'DELETE') {
        return response(500, { ok: false, error: { message: 'Failed to cancel pairing code.' } });
      }
      if (path.endsWith('/devices/dev-1') && options.method === 'DELETE') {
        return response(500, { ok: false, error: { message: 'Failed to revoke device.' } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(screen.getByText("Alex's Tablet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pair a device for Alex' }));
    expect(await screen.findByText('ACTIVE-CODE-NOT-REVOKED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel code' }));
    expect(await screen.findByText('Failed to cancel pairing code.')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE-CODE-NOT-REVOKED')).toBeInTheDocument();
    expect(screen.queryByText('Pairing code cancelled.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "Revoke Alex's Tablet" }));
    expect(await screen.findByText('Failed to revoke device.')).toBeInTheDocument();
    expect(screen.getByText('Paired')).toBeInTheDocument();
    expect(screen.queryByText('Revoked')).not.toBeInTheDocument();
    expect(screen.queryByText('Device access revoked.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Revoke Alex's Tablet" })).toBeInTheDocument();
  });
});
