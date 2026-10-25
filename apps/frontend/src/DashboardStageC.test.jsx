import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
          appRestrictions: body.appRestrictions,
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
            appUsage: [{ packageName: 'com.duolingo', appName: 'Duolingo', durationSeconds: 3600, openCount: 5 }],
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

    // Click Total Screen Time card to switch to Timing mode
    const totalScreenTimeButton = screen.getByRole('button', { name: 'Total Screen Time summary card' });
    fireEvent.click(totalScreenTimeButton);
    expect(screen.getByText('Duolingo')).toBeInTheDocument();
    expect(screen.getByText('Application Usage & Screen Time Breakdown')).toBeInTheDocument();
    expect(screen.queryByText(/5 times opened/)).not.toBeInTheDocument();

    // Click Mobile Pickups & Opens card to switch to App Opens frequency mode
    const mobilePickupsButton = screen.getByRole('button', { name: 'Mobile Pickups & Opens summary card' });
    fireEvent.click(mobilePickupsButton);
    expect(screen.getByText('Application Launch Frequency & Open Counts')).toBeInTheDocument();
    expect(screen.getByText(/5 times opened/)).toBeInTheDocument();

    // Switch back to Timing via setting switcher
    const timingTabBtn = screen.getByRole('button', { name: 'Switch to Timing view' });
    fireEvent.click(timingTabBtn);
    expect(screen.getByText('Application Usage & Screen Time Breakdown')).toBeInTheDocument();
    expect(screen.queryByText(/5 times opened/)).not.toBeInTheDocument();

    // Switch to Rules & Schedules tab
    const rulesTab = screen.getByRole('button', { name: 'Rules & Schedules' });
    fireEvent.click(rulesTab);

    // Verify policy loads
    expect(await screen.findByText('Rules & Schedules: Alex')).toBeInTheDocument();
    expect(screen.getByText('gamingsite.com')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: 'Save Rules & Policy' });
    fireEvent.click(saveButton);

    // Verify save success message
    expect(await screen.findByText('Policy saved successfully (Version 2).')).toBeInTheDocument();
    expect(savedPolicy.version).toBe(2);
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

  it('reflects pending sync status when policy version is bumped past device acknowledgment', async () => {
    let currentPolicy = {
      version: 1,
      screenTime: { dailyLimitMinutes: 60, quietHours: { enabled: false } },
      webRestrictions: { enabled: true, blockedDomains: ['old-site.com'] },
    };

    const mockDevice = {
      id: 'dev-2',
      childProfileId: 'child-1',
      name: "Alex's Chrome",
      platform: 'windows',
      pairedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      pairingStatus: 'paired',
      acknowledgedPolicyVersion: 1,
    };

    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/health')) return response(200, { ok: true, data: { status: 'ready' } });
      if (path.endsWith('/auth/me')) return response(200, { ok: true, data: { parent } });
      if (path.endsWith('/children') && options.method === 'GET') {
        return response(200, { ok: true, data: { children: [child] } });
      }
      if (path.endsWith('/devices') && options.method === 'GET') {
        return response(200, { ok: true, data: { devices: [mockDevice] } });
      }
      if (path.endsWith('/children/child-1/policy') && options.method === 'GET') {
        return response(200, { ok: true, data: { policy: currentPolicy } });
      }
      if (path.endsWith('/children/child-1/policy') && options.method === 'PUT') {
        currentPolicy = { ...currentPolicy, version: 2 };
        return response(200, { ok: true, data: { policy: currentPolicy } });
      }
      if (path.endsWith('/children/child-1/screen-time')) {
        return response(200, {
          ok: true,
          data: {
            date: '2026-10-15',
            totalScreenTimeSeconds: 1200,
            dailyLimitMinutes: 60,
            limitExceeded: false,
            permissionStatus: 'granted',
            appUsage: [],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<App />);

    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(await screen.findByText(/Policy: v1/)).toBeInTheDocument();

    // Open control center and switch to devices tab
    fireEvent.click(screen.getByRole('button', { name: 'Manage rules & screen time for Alex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Devices & Sync' }));

    // Initially in sync with policy v1
    expect(await screen.findByText(/In Sync \(v1\)/)).toBeInTheDocument();

    // Switch to Rules & Schedules and save updated policy
    fireEvent.click(screen.getByRole('button', { name: 'Rules & Schedules' }));
    expect(await screen.findByText('Policy v1')).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: 'Save Rules & Policy' });
    fireEvent.click(saveButton);
    expect(await screen.findByText('Policy saved successfully (Version 2).')).toBeInTheDocument();

    // Switch back to Devices & Sync: status must now report Sync Pending (v1 / v2)
    fireEvent.click(screen.getByRole('button', { name: 'Devices & Sync' }));
    expect(await screen.findByText(/Sync Pending \(v1 \/ v2\)/)).toBeInTheDocument();
  });

  it('navigates to separate pages via top navigation bar options', async () => {
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
      if (path.endsWith('/children/child-1/policy')) {
        return response(200, { ok: true, data: { policy: { version: 1, screenTime: { dailyLimitMinutes: 60 } } } });
      }
      if (path.endsWith('/children/child-1/screen-time')) {
        return response(200, {
          ok: true,
          data: {
            date: '2026-10-15',
            totalScreenTimeSeconds: 1800,
            dailyLimitMinutes: 60,
            limitExceeded: false,
            permissionStatus: 'granted',
            appUsage: [],
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<App />);

    // Initially on Overview
    expect(await screen.findByText('Alex')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Dashboard Views' });

    // 1. Click top option: Screen Time
    const screenTimeNavBtn = within(nav).getByRole('button', { name: 'Screen Time' });
    fireEvent.click(screenTimeNavBtn);
    expect(await screen.findByText('Screen Time Analytics')).toBeInTheDocument();
    expect(screen.getByText('Daily Screen Time: Alex')).toBeInTheDocument();

    // 2. Click top option: Rules & Limits
    const rulesNavBtn = within(nav).getByRole('button', { name: 'Rules & Limits' });
    fireEvent.click(rulesNavBtn);
    expect(await screen.findByText('Rules & Safety Limits')).toBeInTheDocument();
    expect(await screen.findByText('Rules & Schedules: Alex')).toBeInTheDocument();

    // 3. Click top option: Paired Devices
    const devicesNavBtn = within(nav).getByRole('button', { name: 'Paired Devices' });
    fireEvent.click(devicesNavBtn);
    expect(await screen.findByText('Paired Devices & Sync Status')).toBeInTheDocument();

    // 4. Click top option: Downloads
    const downloadsNavBtn = within(nav).getByRole('button', { name: 'Downloads' });
    fireEvent.click(downloadsNavBtn);
    expect(await screen.findByText('Child Device Apps')).toBeInTheDocument();
    expect(screen.getByText('Android App')).toBeInTheDocument();
    expect(screen.getByText('Chrome Extension')).toBeInTheDocument();

    // 5. Click top option: Overview to return
    const overviewNavBtn = within(nav).getByRole('button', { name: 'Overview' });
    fireEvent.click(overviewNavBtn);
    expect(await screen.findByText('Child profiles')).toBeInTheDocument();
  });
});

