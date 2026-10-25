import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DeviceStatusView from './components/DeviceStatusView.jsx';
import ScreenTimeView from './components/ScreenTimeView.jsx';
import WebHistoryView from './components/WebHistoryView.jsx';
import PolicyManager from './components/PolicyManager.jsx';

describe('Data Retention and Companion App Connection', () => {
  const mockChild = { id: 'child-1', displayName: 'Maya' };

  it('renders connected companion app and Chrome extension with live status and data stream indicators', () => {
    const devices = [
      {
        id: 'dev-android-1',
        childProfileId: 'child-1',
        name: "Maya's Galaxy Phone",
        platform: 'android',
        pairingStatus: 'paired',
        pairedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        acknowledgedPolicyVersion: 2,
      },
      {
        id: 'dev-chrome-1',
        childProfileId: 'child-1',
        name: "Maya's School Chromebook",
        platform: 'windows',
        pairingStatus: 'paired',
        pairedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        acknowledgedPolicyVersion: 2,
      },
    ];

    render(
      <DeviceStatusView
        devices={devices}
        activeChild={mockChild}
        policyVersion={2}
        onRequestPairing={() => {}}
        onRevokeDevice={() => {}}
        revokingId={null}
      />
    );

    // Checks heading and both device names
    expect(screen.getByText("Paired Devices: Maya")).toBeInTheDocument();
    expect(screen.getByText("Maya's Galaxy Phone")).toBeInTheDocument();
    expect(screen.getByText("Maya's School Chromebook")).toBeInTheDocument();

    // Verifies platform and live connectivity indicators
    expect(screen.getByText('android App')).toBeInTheDocument();
    expect(screen.getByText('Chrome Extension')).toBeInTheDocument();
    expect(screen.getAllByText(/Live & Online/)).toHaveLength(2);
    expect(screen.getAllByText(/In Sync \(v2\)/)).toHaveLength(2);

    // Verifies data stream descriptions
    expect(screen.getByText(/Screen Time Reporting:/)).toBeInTheDocument();
    expect(screen.getByText(/Web Protection:/)).toBeInTheDocument();
  });

  it('preserves uninstalled companion app in the device list and displays historical data preservation notices', () => {
    const devices = [
      {
        id: 'dev-uninstalled-1',
        childProfileId: 'child-1',
        name: "Maya's Old Phone",
        platform: 'android',
        pairingStatus: 'uninstalled',
        uninstalledAt: new Date().toISOString(),
        pairedAt: '2026-10-01T10:00:00.000Z',
        lastSeenAt: '2026-10-20T10:00:00.000Z',
        acknowledgedPolicyVersion: 1,
      },
    ];

    render(
      <DeviceStatusView
        devices={devices}
        activeChild={mockChild}
        policyVersion={1}
        onRequestPairing={() => {}}
        onRevokeDevice={() => {}}
        revokingId={null}
      />
    );

    // Device is STILL present in list
    expect(screen.getByText("Maya's Old Phone")).toBeInTheDocument();

    // Badges show uninstalled state with data retention guarantee
    expect(screen.getByText('Uninstalled (Data Retained)')).toBeInTheDocument();
    expect(screen.getByText(/remain completely preserved on your parent dashboard/)).toBeInTheDocument();
  });

  it('renders ScreenTimeView with Preserved History Timeline and smart prompt when selected date is empty', async () => {
    const historicalReport = {
      date: '2026-10-24',
      totalScreenTimeSeconds: null,
      dailyLimitMinutes: 60,
      limitExceeded: false,
      permissionStatus: 'no_data',
      source: 'unavailable',
      dataFreshness: null,
      appUsage: [],
      latestAvailableDate: '2026-10-23',
      recentHistory: [
        {
          date: '2026-10-23',
          totalScreenTimeSeconds: 5400,
          deviceUnlockCount: 12,
          appCount: 4,
          permissionGranted: true,
          source: 'measured',
          reportedAt: '2026-10-23T18:00:00.000Z',
        },
      ],
    };

    const pastReport = {
      date: '2026-10-23',
      totalScreenTimeSeconds: 5400,
      dailyLimitMinutes: 60,
      limitExceeded: false,
      permissionStatus: 'granted',
      source: 'measured',
      dataFreshness: {
        lastReportedAt: '2026-10-23T18:00:00.000Z',
        reportingDeviceName: "Maya's Galaxy Phone",
        isStale: false,
      },
      appUsage: [
        { packageName: 'com.khanacademy', appName: 'Khan Academy', durationSeconds: 5400, openCount: 3 },
      ],
      latestAvailableDate: '2026-10-23',
      recentHistory: [
        {
          date: '2026-10-23',
          totalScreenTimeSeconds: 5400,
          deviceUnlockCount: 12,
          appCount: 4,
          permissionGranted: true,
          source: 'measured',
          reportedAt: '2026-10-23T18:00:00.000Z',
        },
      ],
    };

    const fetchMock = vi.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('date=2026-10-23')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: pastReport }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: historicalReport }) };
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ScreenTimeView child={mockChild} />);

    // Verifies the timeline and retention notice render
    expect(await screen.findByText(/Preserved Activity Timeline/)).toBeInTheDocument();
    expect(screen.getByText(/Permanent Historical Record Guarantee/)).toBeInTheDocument();
    expect(screen.getByText(/Uninstalling or disconnecting the companion Android app or Chrome extension never deletes historical usage/)).toBeInTheDocument();

    // Verifies smart empty-day notice with jump button to preserved data
    expect(await screen.findByText(/No new reports for/)).toBeInTheDocument();
    const jumpButton = screen.getByRole('button', { name: /Jump to Latest Preserved Activity/ });
    expect(jumpButton).toBeInTheDocument();

    // Clicking jump button loads preserved past date
    fireEvent.click(jumpButton);
    expect(await screen.findByText('Khan Academy')).toBeInTheDocument();
    expect(screen.getAllByText('1h 30m').length).toBeGreaterThanOrEqual(2);
  });

  it('renders strict 18+ adult content protection with spontaneous Chrome purge in PolicyManager', async () => {
    const { default: PolicyManager } = await import('./components/PolicyManager.jsx');

    const initialPolicy = {
      version: 1,
      screenTime: { dailyLimitMinutes: null, quietHours: { enabled: false, start: '21:00', end: '07:00', days: [] } },
      appRestrictions: { enabled: false, blockedApps: [] },
      webRestrictions: {
        enabled: true,
        blockAdultContent: true,
        blockedDomains: ['tiktok.com'],
      },
    };

    let savedPayload = null;
    const fetchMock = vi.fn(async (url, options) => {
      if (options?.method === 'PUT') {
        savedPayload = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: { policy: { ...initialPolicy, version: 2, ...savedPayload } } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { policy: initialPolicy } }),
      };
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<PolicyManager child={mockChild} onPolicySaved={() => {}} />);

    // Verifies 18+ Protection card and spontaneous purge badge render
    expect(await screen.findByText('Strict 18+ & Adult Content Filter')).toBeInTheDocument();
    expect(screen.getByText(/Spontaneous Tab Purge/)).toBeInTheDocument();
    expect(screen.getByText(/When the child connects the Chrome extension, any existing open tabs with 18\+ content are instantly closed/)).toBeInTheDocument();

    // Verifies the three protection pillars
    expect(screen.getByText(/Vanishes open adult tabs on connection/)).toBeInTheDocument();
    expect(screen.getByText(/Blocks Google, Bing & YouTube adult queries/)).toBeInTheDocument();
    expect(screen.getByText(/50\+ adult domains blocked/)).toBeInTheDocument();

    // Verifies permanently blocked adult networks (included by default without manual selection)
    expect(screen.getByText(/Permanently Blocked 18\+ Adult Networks/)).toBeInTheDocument();
    expect(screen.getByText('Pornhub')).toBeInTheDocument();
    expect(screen.getByText('XVideos')).toBeInTheDocument();
    expect(screen.getByText('Chaturbate')).toBeInTheDocument();

    // Click Save Rules & Policy button
    const saveBtn = screen.getByRole('button', { name: /Save Rules & Policy/ });
    fireEvent.click(saveBtn);

    expect(await screen.findByText(/Policy saved successfully/)).toBeInTheDocument();
    expect(savedPayload.webRestrictions.blockAdultContent).toBe(true);
    expect(savedPayload.webRestrictions.blockedDomains).toEqual(
      expect.arrayContaining(['tiktok.com'])
    );
  });

  it('renders WebHistoryView with Chrome browsing history stream, permanent retention guarantee, and search/filtering', async () => {
    const mockVisits = [
      {
        id: 'wh-1',
        url: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
        title: 'Artificial intelligence - Wikipedia',
        domain: 'en.wikipedia.org',
        visitedAt: '2026-10-24T14:30:00.000Z',
        visitCount: 3,
        isBlocked: false,
        category: 'education',
        deviceName: "Maya's Chromebook",
      },
      {
        id: 'wh-2',
        url: 'https://khanacademy.org/computing',
        title: 'Computer Science | Khan Academy',
        domain: 'khanacademy.org',
        visitedAt: '2026-10-24T15:00:00.000Z',
        visitCount: 1,
        isBlocked: false,
        category: 'education',
        deviceName: "Maya's Chromebook",
      },
      {
        id: 'wh-3',
        url: 'https://pornhub.com/video',
        title: 'Adult Video',
        domain: 'pornhub.com',
        visitedAt: '2026-10-24T15:30:00.000Z',
        visitCount: 1,
        isBlocked: true,
        category: 'blocked',
        deviceName: "Maya's Chromebook",
      },
    ];

    const mockSummary = {
      totalVisits: 3,
      blockedCount: 1,
      uniqueDomainsCount: 3,
      topDomains: [
        { domain: 'en.wikipedia.org', count: 3 },
        { domain: 'khanacademy.org', count: 1 },
        { domain: 'pornhub.com', count: 1 },
      ],
    };

    const mockDevices = [
      {
        id: 'dev-chrome-1',
        childProfileId: 'child-1',
        name: "Maya's Chromebook",
        platform: 'windows',
        pairingStatus: 'paired',
        lastSeenAt: '2026-10-24T15:30:00.000Z',
      },
    ];

    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/web-history/summary')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: mockSummary }),
        };
      }
      if (url.includes('/web-history')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: { ok: true, visits: mockVisits, totalCount: 3 } }),
        };
      }
      if (url.includes('/devices')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: { devices: mockDevices } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: {} }),
      };
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<WebHistoryView child={mockChild} onNavigateToRules={() => {}} />);

    // 1. Verifies Permanent Retention Guarantee banner renders
    expect(await screen.findByText(/Maya's Chrome Browsing Activity/)).toBeInTheDocument();
    expect(screen.getByText('Permanent Retention Guarantee')).toBeInTheDocument();
    expect(screen.getByText(/Data remains permanently accessible even if the child uninstalls the Chrome extension/)).toBeInTheDocument();

    // 2. Verifies Chrome Companion device status indicator
    expect(screen.getAllByText(/Maya's Chromebook/)[0]).toBeInTheDocument();

    // 3. Verifies KPI cards: Total visits, Blocked attempts, Unique domains
    expect(screen.getByText('Total Visits')).toBeInTheDocument();
    expect(screen.getByText('Blocked Attempts')).toBeInTheDocument();
    expect(screen.getByText('Unique Domains')).toBeInTheDocument();
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);

    // 4. Verifies chronological stream entries
    expect(screen.getByText('Artificial intelligence - Wikipedia')).toBeInTheDocument();
    expect(screen.getByText('Computer Science | Khan Academy')).toBeInTheDocument();
    expect(screen.getByText('Adult Video')).toBeInTheDocument();

    // 5. Verifies Safe vs Blocked badges
    expect(screen.getByText('Blocked by BalaKavach')).toBeInTheDocument();
    expect(screen.getAllByText('Safe')).toHaveLength(2);

    // 6. Test Status Filter: clicking 'Blocked Attempts'
    const blockedFilterBtn = screen.getByRole('button', { name: /Blocked Attempts/ });
    fireEvent.click(blockedFilterBtn);

    // Only blocked attempt is visible
    expect(screen.getByText('Adult Video')).toBeInTheDocument();
    expect(screen.queryByText('Artificial intelligence - Wikipedia')).not.toBeInTheDocument();

    // 7. Reset to All Activity
    const allActivityBtn = screen.getByRole('button', { name: /All Activity/ });
    fireEvent.click(allActivityBtn);
    expect(screen.getByText('Artificial intelligence - Wikipedia')).toBeInTheDocument();
  });
});

