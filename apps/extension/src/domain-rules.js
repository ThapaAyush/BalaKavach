export const MAX_BLOCKED_DOMAINS = 100;
export const FIRST_RULE_ID = 1000;

const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Accept a bare hostname or an HTTP(S) origin, returning canonical ASCII. */
export function normalizeDomainInput(input) {
  if (typeof input !== 'string') {
    throw new TypeError('Enter a domain name or HTTP(S) origin.');
  }

  const value = input.trim();
  if (!value || /[\s\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError('Enter a valid domain without spaces or control characters.');
  }

  let hostname;
  if (/^https?:\/\//iu.test(value)) {
    const authority = value.match(/^https?:\/\/([^/?#]*)/iu)?.[1] ?? '';
    if (!authority || authority.includes('@') || authority.includes(':') || authority.includes('%') || /[?#]/u.test(value)) {
      throw new TypeError('Use a bare domain or HTTP(S) origin without credentials, ports, paths, or query values.');
    }
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new TypeError('Enter a valid HTTP(S) origin.');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username || parsed.password ||
      parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash
    ) {
      throw new TypeError('Use a bare domain or HTTP(S) origin without credentials, ports, paths, or query values.');
    }
    hostname = parsed.hostname;
  } else {
    if (/[/:?#@%]/u.test(value)) {
      throw new TypeError('Use a bare domain or HTTP(S) origin.');
    }
    try {
      hostname = new URL(`http://${value}`).hostname;
    } catch {
      throw new TypeError('Enter a valid domain name.');
    }
  }

  hostname = hostname.toLowerCase().replace(/\.$/u, '');
  const labels = hostname.split('.');
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !DOMAIN_LABEL.test(label)) ||
    /^\d+(?:\.\d+){3}$/u.test(hostname) ||
    /^\d+$/u.test(labels.at(-1))
  ) {
    throw new TypeError('Enter a public-style domain name with at least two valid labels.');
  }

  if (hostname.startsWith('www.') && labels.length > 2) {
    hostname = hostname.slice(4);
  }

  return hostname;
}

export function normalizeDomainList(values, maxDomains = MAX_BLOCKED_DOMAINS) {
  if (!Array.isArray(values)) {
    throw new TypeError('The local blocklist must be a list of domains.');
  }
  const normalized = [...new Set(values.map(normalizeDomainInput))].sort();
  if (normalized.length > maxDomains) {
    throw new RangeError(`The local blocklist is limited to ${maxDomains} domains.`);
  }
  return normalized;
}

/** Match only HTTP(S) hostnames; a blocklist domain also matches its subdomains. */
export function matchesBlockedDomain(urlValue, domainValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  let domain;
  try {
    domain = normalizeDomainInput(domainValue);
  } catch {
    return false;
  }
  let hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
  if (hostname.startsWith('www.') && hostname.split('.').length > 2) {
    hostname = hostname.slice(4);
  }
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export const BLOCK_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other'
];

export const ADULT_FIRST_RULE_ID = 2000;
export const MAX_ADULT_DOMAINS = 100;

export const ADULT_18_PLUS_DOMAINS = Object.freeze([
  'adultfriendfinder.com',
  'anyporn.com',
  'badjojo.com',
  'bangbros.com',
  'beeg.com',
  'bongacams.com',
  'brazzers.com',
  'brazzers.network',
  'cam4.com',
  'camsoda.com',
  'chaturbate.com',
  'czechav.com',
  'daftsex.com',
  'drtuber.com',
  'empflix.com',
  'eporner.com',
  'erome.com',
  'fapdu.com',
  'fuq.com',
  'gelbooru.com',
  'heavy-r.com',
  'hentaihaven.xxx',
  'hqporner.com',
  'livejasmin.com',
  'motherless.com',
  'naughtyamerica.com',
  'nhentai.net',
  'onlyfans.com',
  'porn.com',
  'porn555.com',
  'porndig.com',
  'pornhat.com',
  'pornhub.com',
  'pornone.com',
  'redgifs.com',
  'redtube.com',
  'rule34.xxx',
  'sex.com',
  'slutload.com',
  'spankbang.com',
  'stripchat.com',
  'sunporno.com',
  'thumbzilla.com',
  'tnaflix.com',
  'tube18.com',
  'tube8.com',
  'tubegalore.com',
  'twistys.com',
  'upornia.com',
  'voyeurweb.com',
  'xhamster.com',
  'xmoviesforyou.com',
  'xnxx.com',
  'xvideos.com',
  'xxx.com',
  'youjizz.com',
  'youporn.com'
]);

export const ADULT_KEYWORDS = Object.freeze([
  'porn',
  'porno',
  'xxx',
  'xvideos',
  'xnxx',
  'xhamster',
  'redtube',
  'pornhub',
  'hentai',
  'stripchat',
  'chaturbate',
  'spankbang',
  'erotic',
  'nsfw',
  'onlyfans',
  'cam4',
  'youporn'
]);

export function isAdultContentUrl(urlValue, additionalBlockedDomains = []) {
  if (typeof urlValue !== 'string' || !urlValue.trim()) return false;
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;

  let hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
  if (hostname.startsWith('www.') && hostname.split('.').length > 2) {
    hostname = hostname.slice(4);
  }

  // 1. Direct match with curated 18+ adult domains or subdomains
  for (const adultDomain of ADULT_18_PLUS_DOMAINS) {
    if (hostname === adultDomain || hostname.endsWith(`.${adultDomain}`)) {
      return true;
    }
  }

  // 2. Direct match with additional parent-blocked domains
  if (Array.isArray(additionalBlockedDomains)) {
    for (const blocked of additionalBlockedDomains) {
      if (matchesBlockedDomain(urlValue, blocked)) {
        return true;
      }
    }
  }

  // 3. Search engine query inspection (Google, Bing, Yahoo, DuckDuckGo, YouTube, etc.)
  const isSearchEngine = (
    hostname.includes('google.') ||
    hostname.includes('bing.') ||
    hostname.includes('yahoo.') ||
    hostname.includes('duckduckgo.') ||
    hostname.includes('youtube.') ||
    hostname.includes('yandex.') ||
    hostname.includes('baidu.')
  );

  const fullSearch = (url.search || '').toLowerCase();
  const fullPath = (url.pathname || '').toLowerCase();

  if (isSearchEngine && fullSearch) {
    const params = url.searchParams;
    const queryVal = (
      params.get('q') ||
      params.get('query') ||
      params.get('search_query') ||
      params.get('p') ||
      ''
    ).toLowerCase();

    if (queryVal) {
      for (const kw of ADULT_KEYWORDS) {
        const regex = new RegExp(`(^|[^a-z0-9])${kw}([^a-z0-9]|$)`, 'u');
        if (regex.test(queryVal)) {
          return true;
        }
      }
    }
  }

  // 4. URL path segment check (e.g. /porn/, /xxx/, /nsfw/)
  const pathSegments = fullPath.split('/').filter(Boolean);
  for (const seg of pathSegments) {
    if (['porn', 'porno', 'xxx', 'hentai', 'nsfw'].includes(seg)) {
      return true;
    }
  }

  return false;
}

export function createBlockRules(domains, maxDomains = MAX_BLOCKED_DOMAINS) {
  const normalized = normalizeDomainList(domains, maxDomains);
  return normalized.map((domain, index) => ({
    id: FIRST_RULE_ID + index,
    priority: 1,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      requestDomains: [domain],
      resourceTypes: BLOCK_RESOURCE_TYPES
    }
  }));
}

export function createAdultBlockRules(domains = ADULT_18_PLUS_DOMAINS, startId = ADULT_FIRST_RULE_ID) {
  const normalized = normalizeDomainList(domains, MAX_ADULT_DOMAINS);
  return normalized.map((domain, index) => ({
    id: startId + index,
    priority: 2,
    action: { type: 'block' },
    condition: {
      urlFilter: `||${domain}^`,
      requestDomains: [domain],
      resourceTypes: BLOCK_RESOURCE_TYPES
    }
  }));
}

export function isKidsGuardRuleId(id, maxDomains = MAX_BLOCKED_DOMAINS) {
  return Number.isInteger(id) && (
    (id >= FIRST_RULE_ID && id < FIRST_RULE_ID + maxDomains) ||
    (id >= ADULT_FIRST_RULE_ID && id < ADULT_FIRST_RULE_ID + MAX_ADULT_DOMAINS)
  );
}

export function isQuietHoursActive(quietHours, now = new Date()) {
  if (!quietHours || !quietHours.enabled) return false;
  const { start, end, days } = quietHours;
  if (!start || !end) return false;

  const startParts = start.trim().split(':').map(Number);
  const endParts = end.trim().split(':').map(Number);
  if (startParts.length !== 2 || endParts.length !== 2) return false;

  const [startH, startM] = startParts;
  const [endH, endM] = endParts;
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[now.getDay()];
  const activeDays = Array.isArray(days) ? days.map((d) => String(d).toLowerCase()) : [];
  const isDayActive = activeDays.length === 0 || activeDays.includes(dayName);

  if (startMinutes < endMinutes) {
    return isDayActive && (currentMinutes >= startMinutes && currentMinutes < endMinutes);
  } else if (startMinutes > endMinutes) {
    if (currentMinutes >= startMinutes && isDayActive) return true;
    if (currentMinutes < endMinutes) {
      const prevDayIndex = (now.getDay() + 6) % 7;
      const prevDay = dayNames[prevDayIndex];
      return activeDays.length === 0 || activeDays.includes(prevDay);
    }
    return false;
  }
  return isDayActive;
}
