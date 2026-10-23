import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App.jsx';

const parent = { id: 'parent-id', email: 'parent@example.com' };
const childrenList = [
  { id: 'child-1', displayName: 'Alex', dateOfBirth: '2015-05-10' },
  { id: 'child-2', displayName: 'Deep', dateOfBirth: '2013-08-20' },
];

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

describe('Page Location Preservation Across Website Refreshes', () => {
  function setupMocks() {
    const fetchMock = vi.fn(async (url, options = {}) => {
      const parsedUrl = new URL(String(url));
      const path = parsedUrl.pathname;

      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: childrenList } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.includes('/screen-time')) {
        return response(200, {
          ok: true,
          data: {
            date: '2026-10-23',
            totalScreenTimeSeconds: 3600,
            deviceUnlockCount: 12,
            totalAppOpens: 45,
            dailyLimitMinutes: 120,
            limitExceeded: false,
            permissionStatus: 'granted',
            source: 'measured',
            appUsage: [
              { packageName: 'com.whatsapp', appName: 'WhatsApp', durationSeconds: 2400, openCount: 15 },
            ],
          },
        });
      }
      if (path.includes('/policy')) {
        return response(200, {
          ok: true,
          data: {
            policy: {
              version: 1,
              screenTime: { dailyLimitMinutes: 120 },
              webRestrictions: { enabled: false, blockedDomains: [] },
            },
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('preserves Screen Time view and selected child across simulated refresh', async () => {
    setupMocks();

    // 1. Initial load
    const { unmount } = render(<App />);
    expect(await screen.findByText('Alex')).toBeInTheDocument();

    // 2. Navigate to Screen Time
    const nav = screen.getByRole('navigation', { name: 'Dashboard Views' });
    const screenTimeBtn = withinNav(nav, 'Screen Time');
    fireEvent.click(screenTimeBtn);
    expect(await screen.findByText('Screen Time Analytics')).toBeInTheDocument();

    // 3. Switch active child to Deep
    const deepBtn = await screen.findByRole('button', { name: /Deep/i });
    fireEvent.click(deepBtn);
    expect(await screen.findByText('Daily Screen Time: Deep')).toBeInTheDocument();

    // Verify URL was synced with page location
    expect(window.location.search).toContain('page=screentime');
    expect(window.location.search).toContain('child=child-2');

    // 4. Simulate page refresh: unmount and re-render App without resetting location/storage
    unmount();
    render(<App />);

    // Must remain on Screen Time Analytics for Deep!
    expect(await screen.findByText('Screen Time Analytics')).toBeInTheDocument();
    expect(await screen.findByText('Daily Screen Time: Deep')).toBeInTheDocument();
  });

  it('preserves Rules & Limits page across simulated refresh', async () => {
    setupMocks();

    // Simulate arriving directly or having refreshed with ?page=rules&child=child-1
    window.history.replaceState(null, '', '/?page=rules&child=child-1');
    sessionStorage.setItem('balakavach_page', 'rules');
    sessionStorage.setItem('balakavach_child_id', 'child-1');

    render(<App />);

    expect(await screen.findByText('Rules & Safety Limits')).toBeInTheDocument();
    expect(await screen.findByText('Rules & Schedules: Alex')).toBeInTheDocument();
  });

  it('preserves Downloads page across simulated refresh', async () => {
    setupMocks();

    window.history.replaceState(null, '', '/?page=downloads');
    sessionStorage.setItem('balakavach_page', 'downloads');

    render(<App />);

    expect(await screen.findByText('Child Device Apps')).toBeInTheDocument();
    expect(screen.getByText('Android App')).toBeInTheDocument();
  });
});

function withinNav(nav, buttonName) {
  const buttons = nav.querySelectorAll('button');
  for (const b of buttons) {
    if (b.textContent.includes(buttonName)) return b;
  }
  throw new Error(`Button ${buttonName} not found in nav`);
}
