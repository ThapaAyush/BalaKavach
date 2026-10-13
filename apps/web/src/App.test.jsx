import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App.jsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KidsGuard web foundation', () => {
  it('shows API and database status from the health endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: { status: 'degraded', dependencies: { mongodb: 'disconnected' } },
      }),
    }));

    render(<App />);

    expect(await screen.findByText('API available')).toBeInTheDocument();
    expect(screen.getByText(/MongoDB disconnected/)).toBeInTheDocument();
  });

  it('shows a clear unavailable state when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(<App />);

    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Start the API at localhost:5000/)).toBeInTheDocument();
  });
});
