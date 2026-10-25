import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DownloadsView from './components/DownloadsView.jsx';
import { downloadMeta } from './lib/downloadMeta.js';

describe('DownloadsView Component', () => {
  it('renders Android App download card with current version and download link', () => {
    const { container } = render(<DownloadsView isStandalone={true} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Android App' })).toBeInTheDocument();
    expect(screen.getByText(downloadMeta.android.versionName)).toBeInTheDocument();
    expect(screen.getByText(downloadMeta.android.sizeFormatted)).toBeInTheDocument();

    const apkBtn = container.querySelector('#download-apk-btn');
    expect(apkBtn).toBeInTheDocument();
    expect(apkBtn).toHaveAttribute('href', expect.stringContaining('/balakavach-companion.apk'));
    expect(apkBtn).toHaveAttribute('download', 'balakavach-companion.apk');
  });

  it('renders Chrome Extension download card with current version and download link', () => {
    const { container } = render(<DownloadsView isStandalone={true} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Chrome Extension' })).toBeInTheDocument();
    expect(screen.getByText(downloadMeta.extension.versionName)).toBeInTheDocument();
    expect(screen.getByText(downloadMeta.extension.sizeFormatted)).toBeInTheDocument();

    const extBtn = container.querySelector('#download-extension-btn');
    expect(extBtn).toBeInTheDocument();
    expect(extBtn).toHaveAttribute('href', expect.stringContaining('/balakavach-chrome-extension.zip'));
    expect(extBtn).toHaveAttribute('download', 'balakavach-chrome-extension.zip');
  });

  it('keeps direct static APK and extension URLs even if backend update API returns relative API download routes', async () => {
    const { waitFor } = await import('@testing-library/react');
    const api = await import('./lib/api.js');
    const spy = vi.spyOn(api, 'apiGet').mockResolvedValueOnce({
      updatedAt: '2026-10-25T10:00:00.000Z',
      android: {
        versionName: 'v0.1.2',
        downloadUrl: '/api/v1/app-update/download',
        directApkUrl: '/balakavach-companion.apk',
        fileName: 'balakavach-companion.apk',
      },
      extension: {
        versionName: 'v0.3.1',
        downloadUrl: '/api/v1/app-update/download?target=extension',
        directZipUrl: '/balakavach-chrome-extension.zip',
        fileName: 'balakavach-chrome-extension.zip',
      },
    });

    const { container } = render(<DownloadsView isStandalone={true} />);

    await waitFor(() => {
      const apkBtn = container.querySelector('#download-apk-btn');
      expect(apkBtn).toHaveAttribute('href', expect.stringContaining('/balakavach-companion.apk'));
      expect(apkBtn).not.toHaveAttribute('href', expect.stringContaining('/api/v1/app-update/download'));
    });

    const extBtn = container.querySelector('#download-extension-btn');
    expect(extBtn).toHaveAttribute('href', expect.stringContaining('/balakavach-chrome-extension.zip'));
    expect(extBtn).not.toHaveAttribute('href', expect.stringContaining('/api/v1/app-update/download'));

    spy.mockRestore();
  });
});
