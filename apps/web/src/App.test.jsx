import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('registers, signs in with a cookie-backed request, and logs out', async () => {
    let signedIn = false;
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
    expect(JSON.parse(authCalls[1][1].body)).toEqual({
      email: 'parent@example.com',
      password: 'secure parent password',
    });
    expect(signedIn).toBe(false);
  });
});
