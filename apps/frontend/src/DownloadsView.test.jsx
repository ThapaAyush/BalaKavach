import { describe, it, expect } from 'vitest';
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
});
