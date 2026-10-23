import { describe, it, expect } from 'vitest';
import { formatAppDisplayName, isPackageName, humanizePackageName } from './appDisplayNames.js';

describe('appDisplayNames utility', () => {
  it('detects package names accurately', () => {
    expect(isPackageName('com.whatsapp')).toBe(true);
    expect(isPackageName('com.pw.pwtalk')).toBe(true);
    expect(isPackageName('com.google.android.apps.photos')).toBe(true);
    expect(isPackageName('WhatsApp')).toBe(false);
    expect(isPackageName('BalaKavach')).toBe(false);
    expect(isPackageName('One UI Home')).toBe(false);
  });

  it('correctly maps known popular packages to friendly names', () => {
    expect(formatAppDisplayName('com.whatsapp', 'com.whatsapp')).toBe('WhatsApp');
    expect(formatAppDisplayName('com.pw.pwtalk', 'com.pw.pwtalk')).toBe('PW Talk');
    expect(formatAppDisplayName('com.app.media.rgm', 'com.app.media.rgm')).toBe('RGM Media');
    expect(formatAppDisplayName('com.google.android.apps.photos', 'com.google.android.apps.photos')).toBe('Google Photos');
    expect(formatAppDisplayName('com.google.android.apps.maps', 'com.google.android.apps.maps')).toBe('Google Maps');
    expect(formatAppDisplayName('com.google.android.apps.docs', 'com.google.android.apps.docs')).toBe('Google Docs');
    expect(formatAppDisplayName('com.sec.android.app.clockpackage', 'com.sec.android.app.clockpackage')).toBe('Clock');
    expect(formatAppDisplayName('com.sec.android.app.launcher', 'com.sec.android.app.launcher')).toBe('One UI Home');
    expect(formatAppDisplayName('com.kidsguard.child.debug', 'com.kidsguard.child.debug')).toBe('BalaKavach');
  });

  it('preserves user-friendly app names when already present', () => {
    expect(formatAppDisplayName('BalaKavach', 'com.kidsguard.child.debug')).toBe('BalaKavach');
    expect(formatAppDisplayName('One UI Home', 'com.sec.android.app.launcher')).toBe('One UI Home');
    expect(formatAppDisplayName('Duolingo', 'com.duolingo')).toBe('Duolingo');
  });

  it('humanizes unknown reverse-DNS package names cleanly', () => {
    expect(humanizePackageName('com.example.super_game')).toBe('Super Game');
    expect(humanizePackageName('com.mycompany.photoEditor')).toBe('Photo Editor');
  });
});
