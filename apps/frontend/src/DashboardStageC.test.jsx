import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App.jsx';

const parent = { id: 'parent-id', email: 'parent@example.com' };
const child = { id: 'child-1', displayName: 'Alex', dateOfBirth: '2015-05-10' };

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

describe('Parent Web Dashboard - Stage C Policies, Screen Time, and Sync', () => {
  it('opens child control center, loads policy, and saves updated rules', async () => {
    let savedPolicy = {
      version: 1,
      screenTime: {
        dailyLimitMinutes: 60,
        quietHours: { enabled: true, start: '21:00', end: '07:00', days: ['monday', 'sunday'] },
      },
      webRestrictions: { enabled: true, blockedDomains: ['gamingsite.com'] },
    };

    const fetchMock = vi.fn(async (url, options = {}) => {
      const parsedUrl = new URL(String(url));
      const path = parsedUrl.pathname;

      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: [child] } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children/child-1/policy') && options.method === 'GET') {
        return response(200, { ok: true, data: { policy: savedPolicy } });
      }
      if (path.endsWith('/children/child-1/policy') && options.method === 'PUT') {
        const body = JSON.parse(options.body);
        savedPolicy = {
          version: 2,
          screenTime: body.screenTime,
          webRestrictions: body.webRestrictions,
        };
        return response(200, { ok: true, data: { policy: savedPolicy } });
      }
      if (path.endsWith('/children/child-1/screen-time')) {
        return response(200, {
          ok: true,
          data: {
            date: '2026-10-15',
            totalScreenTimeSeconds: 3600,
            dailyLimitMinutes: 60,
            limitExceeded: false,
            permissionStatus: 'granted',
            source: 'measured',
            dataFreshness: {
              lastReportedAt: new Date().toISOString(),
              reportingDeviceName: "Alex's Tablet",
              isStale: false,
            },
            appUsage: [{ packageName: 'com.duolingo', appName: 'Duolingo', durationSeconds: 3600 }],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    // Verify child is rendered
    expect(await screen.findByText('Alex')).toBeInTheDocument();

    // Click Rules & Screen Time button to open control center
    const manageButton = screen.getByRole('button', { name: 'Manage rules & screen time for Alex' });
    fireEvent.click(manageButton);

    // Default tab is Screen Time: verify screen-time report is displayed
    expect(await screen.findByText('Daily Screen Time: Alex')).toBeInTheDocument();
    expect(screen.getByText('1h 0m')).toBeInTheDocument();
    expect(screen.getByText('Duolingo')).toBeInTheDocument();

    // Switch to Rules & Schedules tab
    const rulesTab = screen.getByRole('button', { name: 'Rules & Schedules' });
    fireEvent.click(rulesTab);

    // Verify policy loads
    expect(await screen.findByText('Rules & Schedules: Alex')).toBeInTheDocument();
    expect(screen.getByDisplayValue('60')).toBeInTheDocument();
    expect(screen.getByText('gamingsite.com')).toBeInTheDocument();

    // Modify limit and save
    const limitInput = screen.getByLabelText(/Daily Screen-Time Limit/);
    fireEvent.change(limitInput, { target: { value: '120' } });

    const saveButton = screen.getByRole('button', { name: 'Save Rules & Policy' });
    fireEvent.click(saveButton);

    // Verify save success message
    expect(await screen.findByText('Policy saved successfully (Version 2).')).toBeInTheDocument();
    expect(savedPolicy.version).toBe(2);
    expect(savedPolicy.screenTime.dailyLimitMinutes).toBe(120);
  });

  it('displays permission denied alert when child device reports missing usage access', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: [child] } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [] } });
      }
      if (path.endsWith('/children/child-1/screen-time')) {
        return response(200, {
          ok: true,
          data: {
            date: '2026-10-15',
            totalScreenTimeSeconds: null,
            dailyLimitMinutes: 60,
            limitExceeded: false,
            permissionStatus: 'denied',
            source: 'unavailable',
            dataFreshness: null,
            appUsage: [],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<App />);

    expect(await screen.findByText('Alex')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Manage rules & screen time for Alex' }));

    // Verifies the alert is rendered and zero values are not fabricated
    expect(await screen.findByText(/Usage Access Not Granted on Device/)).toBeInTheDocument();
    expect(screen.getByText('None recorded')).toBeInTheDocument();
  });

  it('displays device sync status and allows child deletion with confirmation', async () => {
    let childList = [child];
    const mockDevice = {
      id: 'dev-1',
      childProfileId: 'child-1',
      name: "Alex's Tablet",
      platform: 'android',
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      pairingStatus: 'paired',
      acknowledgedPolicyVersion: 2,
    };

    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: childList } });
      }
      if (path.endsWith('/children/child-1') && options.method === 'DELETE') {
        childList = [];
        return response(204);
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [mockDevice] } });
      }
      if (path.endsWith('/children/child-1/screen-time')) {
        return response(200, {
          ok: true,
          data: {
            date: '2026-10-15',
            totalScreenTimeSeconds: null,
            dailyLimitMinutes: null,
            limitExceeded: false,
            permissionStatus: 'no_data',
            dataFreshness: null,
            appUsage: [],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<App />);

    expect(await screen.findByText('Alex')).toBeInTheDocument();

    // Open control center and switch to devices tab
    fireEvent.click(screen.getByRole('button', { name: 'Manage rules & screen time for Alex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Devices & Sync' }));

    // Verify sync badge displays
    expect(await screen.findByText(/In Sync \(v2\)/)).toBeInTheDocument();

    // Test child deletion confirmation prompt
    const deleteButton = screen.getByRole('button', { name: 'Delete Alex' });
    fireEvent.click(deleteButton);

    expect(await screen.findByText(/Are you sure you want to delete Alex\?/)).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirm Delete' });
    fireEvent.click(confirmButton);

    expect(await screen.findByText('Child profile deleted.')).toBeInTheDocument();
    expect(screen.queryByText("Alex's Tablet")).not.toBeInTheDocument();
  });
});
