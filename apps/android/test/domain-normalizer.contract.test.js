import test from 'node:test';
import assert from 'node:assert/strict';

// Mirror of Android DomainNormalizer and DomainRuleEngine contracts
const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const MAX_BLOCKED_DOMAINS = 100;

function normalizeDomainInput(input) {
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

function normalizeDomainList(values, maxDomains = MAX_BLOCKED_DOMAINS) {
  if (!Array.isArray(values)) {
    throw new TypeError('The local blocklist must be a list of domains.');
  }
  const normalized = [...new Set(values.map(normalizeDomainInput))].sort();
  if (normalized.length > maxDomains) {
    throw new RangeError(`The local blocklist is limited to ${maxDomains} domains.`);
  }
  return normalized;
}

function matchesBlockedDomain(urlValue, domainValue) {
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

test('Android contract: normalizes bare domains, HTTP origins, trailing dots, and Unicode to ASCII', () => {
  assert.equal(normalizeDomainInput('example.com'), 'example.com');
  assert.equal(normalizeDomainInput('EXAMPLE.COM.'), 'example.com');
  assert.equal(normalizeDomainInput('Sub.Domain.org'), 'sub.domain.org');
  assert.equal(normalizeDomainInput('https://example.com/'), 'example.com');
  assert.equal(normalizeDomainInput('https://bücher.example'), 'xn--bcher-kva.example');
});

test('Android contract: rejects malformed, spaces, control chars, credentials, ports, and paths', () => {
  for (const value of [
    null, '', '   ', 'localhost', '127.0.0.1', 'https://[::1]', '*.example.com',
    'ftp://example.com', 'https://user@example.com', 'user@example.com', 'https://example.com:8443',
    'example.com:8080', 'https://example.com/path', 'example.com/path', 'https://example.com/?q=x',
    'http:///example.com', 'bad..example', '-bad.example', 'example-.com', 'example .com',
    'example\u0000.com', 'https://example.com#fragment', 'example.123'
  ]) {
    assert.throws(() => normalizeDomainInput(value), { name: 'TypeError' }, `Failed on ${value}`);
  }
});

test('Android contract: normalizes duplicate domains and enforces the configured list limit', () => {
  assert.deepEqual(normalizeDomainList(['B.example', 'a.example', 'b.example']), ['a.example', 'b.example']);
  assert.throws(() => normalizeDomainList(['a.example', 'b.example'], 1), { name: 'RangeError' });
  assert.throws(() => normalizeDomainList('a.example'), { name: 'TypeError' });
});

test('Android contract: matchesBlockedDomain matches exact domain and subdomains', () => {
  assert.equal(matchesBlockedDomain('https://example.com/page', 'example.com'), true);
  assert.equal(matchesBlockedDomain('http://sub.example.com', 'example.com'), true);
  assert.equal(matchesBlockedDomain('https://deep.sub.example.com/foo', 'example.com'), true);
  assert.equal(matchesBlockedDomain('https://notexample.com', 'example.com'), false);
  assert.equal(matchesBlockedDomain('https://example.org', 'example.com'), false);
  assert.equal(matchesBlockedDomain('ftp://example.com', 'example.com'), false);
});
