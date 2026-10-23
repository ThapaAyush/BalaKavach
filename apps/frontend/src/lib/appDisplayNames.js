/**
 * Utility to format application display names cleanly across KidsGuard UI.
 * Never leaks raw reverse-DNS package names like `com.xxx` or secondary `(com.xxx)`
 * to users on the dashboard or companion apps.
 */

export const KNOWN_APP_DISPLAY_NAMES = {
  'com.whatsapp': 'WhatsApp',
  'com.whatsapp.w4b': 'WhatsApp Business',
  'com.pw.pwtalk': 'PW Talk',
  'com.app.media.rgm': 'RGM Media',
  'com.google.android.apps.photos': 'Google Photos',
  'com.google.android.apps.maps': 'Google Maps',
  'com.google.android.apps.docs': 'Google Docs',
  'com.google.android.youtube': 'YouTube',
  'com.google.android.apps.youtube.music': 'YouTube Music',
  'com.google.android.gm': 'Gmail',
  'com.google.android.googlequicksearchbox': 'Google',
  'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'com.google.android.calendar': 'Google Calendar',
  'com.google.android.contacts': 'Contacts',
  'com.google.android.dialer': 'Phone',
  'com.google.android.apps.messaging': 'Messages',
  'com.android.chrome': 'Chrome',
  'com.android.vending': 'Google Play Store',
  'com.sec.android.app.clockpackage': 'Clock',
  'com.sec.android.app.camera': 'Camera',
  'com.sec.android.app.myfiles': 'My Files',
  'com.sec.android.gallery3d': 'Gallery',
  'com.sec.android.app.launcher': 'One UI Home',
  'com.sec.android.app.sbrowser': 'Samsung Internet',
  'com.sec.android.app.popupcalculator': 'Calculator',
  'com.sec.android.app.voicenote': 'Voice Recorder',
  'com.sec.android.easyMover': 'Smart Switch',
  'com.samsung.android.calendar': 'Samsung Calendar',
  'com.samsung.android.dialer': 'Phone',
  'com.samsung.android.messaging': 'Messages',
  'com.kidsguard.child': 'BalaKavach',
  'com.kidsguard.child.debug': 'BalaKavach',
  'com.instagram.android': 'Instagram',
  'com.facebook.katana': 'Facebook',
  'com.facebook.orca': 'Messenger',
  'com.facebook.lite': 'Facebook Lite',
  'com.snapchat.android': 'Snapchat',
  'com.spotify.music': 'Spotify',
  'com.netflix.mediaclient': 'Netflix',
  'com.discord': 'Discord',
  'com.zhiliaoapp.musically': 'TikTok',
  'com.roblox.client': 'Roblox',
  'com.mojang.minecraftpe': 'Minecraft',
  'com.twitter.android': 'X (Twitter)',
  'org.telegram.messenger': 'Telegram',
  'org.telegram.plus': 'Telegram Plus',
  'com.truecaller': 'Truecaller',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm',
  'in.org.npci.upiapp': 'BHIM UPI',
  'com.amazon.mShop.android.shopping': 'Amazon Shopping',
  'com.flipkart.android': 'Flipkart',
  'com.jio.media.jiobeats': 'JioSaavn',
  'com.jio.myjio': 'MyJio',
  'com.hotstar': 'Disney+ Hotstar',
  'in.startv.hotstar': 'Disney+ Hotstar',
  'com.zee5.hibiscus': 'ZEE5',
  'com.sonyliv': 'Sony LIV',
  'com.ubercab': 'Uber',
  'com.olacabs.customer': 'Ola',
  'in.swiggy.android': 'Swiggy',
  'com.application.zomato': 'Zomato',
  'com.duolingo': 'Duolingo',
  'org.khanacademy.android': 'Khan Academy',
  'com.chess': 'Chess.com',
  'com.brave.browser': 'Brave Browser',
  'org.mozilla.firefox': 'Firefox',
  'com.microsoft.emmx': 'Microsoft Edge',
  'com.microsoft.office.officehubrow': 'Microsoft 365',
};

/**
 * Checks if a string looks like a reverse-domain package name (e.g. com.whatsapp).
 */
export function isPackageName(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (
    s.startsWith('com.') ||
    s.startsWith('org.') ||
    s.startsWith('net.') ||
    s.startsWith('io.') ||
    s.startsWith('in.') ||
    s.startsWith('gov.') ||
    s.startsWith('tv.') ||
    s.startsWith('app.') ||
    s.includes('.android.')
  ) {
    return true;
  }
  return s.includes('.') && !s.includes(' ') && s.split('.').length >= 3;
}

/**
 * Parses a reverse-domain package name into a readable app title.
 */
export function humanizePackageName(pkg) {
  if (!pkg || typeof pkg !== 'string') return 'Application';
  const cleanPkg = pkg.trim();
  if (KNOWN_APP_DISPLAY_NAMES[cleanPkg]) {
    return KNOWN_APP_DISPLAY_NAMES[cleanPkg];
  }

  let p = cleanPkg;
  p = p.replace(/^(com|org|net|io|in|gov|tv)\./i, '');
  p = p.replace(
    /^(google\.android\.apps\.|google\.android\.|sec\.android\.app\.|sec\.android\.|android\.apps\.|android\.)/i,
    ''
  );

  let parts = p.split('.').filter(Boolean);
  // Filter out redundant technical words
  const filtered = parts.filter(
    (part) => !['app', 'apps', 'android', 'mobile', 'client'].includes(part.toLowerCase())
  );
  if (filtered.length > 0) {
    parts = filtered;
  }

  // If there are multiple parts, the last part is almost always the app name
  // e.g. [example, super_game] -> super_game
  // unless the earlier part is an abbreviation/brand like "pw" for "pw.pwtalk"
  let target = parts[parts.length - 1];
  if (parts.length > 1 && parts[0].length <= 3 && !target.toLowerCase().startsWith(parts[0].toLowerCase())) {
    target = `${parts[0]} ${target}`;
  }

  // Remove trailing "package" (e.g., clockpackage -> clock)
  target = target.replace(/package$/i, '');

  // Split camelCase & underscores
  target = target.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ');

  const words = target
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

  return words.length > 0 ? words.join(' ') : cleanPkg;
}

/**
 * Returns only the direct, user-friendly application name.
 * If rawName is already human-friendly (e.g. "BalaKavach", "One UI Home", "WhatsApp"), returns it directly.
 * If rawName is a raw package name (e.g. "com.pw.pwtalk"), humanizes it cleanly to "PW Talk".
 */
export function formatAppDisplayName(rawName, packageName) {
  if (packageName && KNOWN_APP_DISPLAY_NAMES[packageName]) {
    return KNOWN_APP_DISPLAY_NAMES[packageName];
  }
  if (rawName && KNOWN_APP_DISPLAY_NAMES[rawName]) {
    return KNOWN_APP_DISPLAY_NAMES[rawName];
  }
  if (rawName && typeof rawName === 'string') {
    const trimmed = rawName.trim();
    if (trimmed.length > 0 && !isPackageName(trimmed)) {
      return trimmed;
    }
  }
  return humanizePackageName(packageName || rawName);
}
