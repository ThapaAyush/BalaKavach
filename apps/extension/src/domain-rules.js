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
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function createBlockRules(domains, maxDomains = MAX_BLOCKED_DOMAINS) {
  const normalized = normalizeDomainList(domains, maxDomains);
  return normalized.map((domain, index) => ({
    id: FIRST_RULE_ID + index,
    priority: 1,
    action: { type: 'block' },
    condition: {
      requestDomains: [domain],
      resourceTypes: ['main_frame']
    }
  }));
}

export function isKidsGuardRuleId(id, maxDomains = MAX_BLOCKED_DOMAINS) {
  return Number.isInteger(id) && id >= FIRST_RULE_ID && id < FIRST_RULE_ID + maxDomains;
}
