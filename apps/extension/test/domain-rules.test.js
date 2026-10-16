import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_RESOURCE_TYPES,
  createBlockRules,
  matchesBlockedDomain,
  normalizeDomainInput,
  normalizeDomainList
} from '../src/domain-rules.js';

test('normalizes bare domains, HTTP origins, trailing dots, and Unicode to ASCII', () => {
  assert.equal(normalizeDomainInput(' Example.COM. '), 'example.com');
  assert.equal(normalizeDomainInput('https://example.com/'), 'example.com');
  assert.equal(normalizeDomainInput('https://bücher.example'), 'xn--bcher-kva.example');
});

test('normalizes www. aliases to base domain while preserving distinct subdomains', () => {
  assert.equal(normalizeDomainInput('youtube.com'), 'youtube.com');
  assert.equal(normalizeDomainInput('www.youtube.com'), 'youtube.com');
  assert.equal(normalizeDomainInput('https://www.youtube.com/'), 'youtube.com');
  assert.equal(normalizeDomainInput('https://youtube.com/'), 'youtube.com');
  assert.equal(normalizeDomainInput('https://m.youtube.com/'), 'm.youtube.com');
  assert.equal(normalizeDomainInput('www.example.co.uk'), 'example.co.uk');
  assert.equal(normalizeDomainInput('www.com'), 'www.com');
});

test('rejects malformed, unsupported, local, IP, credential, port, path, and query inputs', () => {
  for (const value of [
    '', 'localhost', '127.0.0.1', 'https://[::1]', '*.example.com',
    'ftp://example.com', 'https://user@example.com', 'https://example.com:8443',
    'https://example.com/path', 'https://example.com/?q=x', 'http:///example.com',
    'https://%65xample.com', '%65xample.com', 'bad..example', '-bad.example',
    'example .com', 'https://example.com#fragment'
  ]) {
    assert.throws(() => normalizeDomainInput(value), { name: 'TypeError' }, value);
  }
});

test('normalizes duplicate domains and enforces the configured list limit', () => {
  assert.deepEqual(normalizeDomainList(['B.example', 'a.example', 'b.example']), ['a.example', 'b.example']);
  assert.throws(() => normalizeDomainList(['a.example', 'b.example'], 1), { name: 'RangeError' });
  assert.throws(() => normalizeDomainList('a.example'), { name: 'TypeError' });
});

test('URL matching is exact or subdomain-only and handles HTTP(S) URLs', () => {
  assert.equal(matchesBlockedDomain('https://example.com/page', 'example.com'), true);
  assert.equal(matchesBlockedDomain('http://news.example.com', 'example.com'), true);
  assert.equal(matchesBlockedDomain('https://notexample.com', 'example.com'), false);
  assert.equal(matchesBlockedDomain('file:///example.com', 'example.com'), false);
  assert.equal(matchesBlockedDomain('not a URL', 'example.com'), false);

  // Subdomain & www alias matching
  assert.equal(matchesBlockedDomain('https://youtube.com', 'www.youtube.com'), true);
  assert.equal(matchesBlockedDomain('https://www.youtube.com/', 'www.youtube.com'), true);
  assert.equal(matchesBlockedDomain('https://m.youtube.com/', 'www.youtube.com'), true);
  assert.equal(matchesBlockedDomain('https://youtube.com/', 'https://www.youtube.com/'), true);
  assert.equal(matchesBlockedDomain('https://www.youtube.com/watch?v=123', 'youtube.com'), true);
  assert.equal(matchesBlockedDomain('https://m.youtube.com', 'https://m.youtube.com/'), true);
  assert.equal(matchesBlockedDomain('https://youtube.com', 'https://m.youtube.com/'), false);
});

test('creates comprehensive blocking rules across resource types with a dedicated ID range', () => {
  assert.deepEqual(createBlockRules(['b.example', 'a.example']), [
    {
      id: 1000,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||a.example^',
        requestDomains: ['a.example'],
        resourceTypes: BLOCK_RESOURCE_TYPES
      }
    },
    {
      id: 1001,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||b.example^',
        requestDomains: ['b.example'],
        resourceTypes: BLOCK_RESOURCE_TYPES
      }
    }
  ]);
  assert.deepEqual(createBlockRules(['https://www.youtube.com/']), [
    {
      id: 1000,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||youtube.com^',
        requestDomains: ['youtube.com'],
        resourceTypes: BLOCK_RESOURCE_TYPES
      }
    }
  ]);
  assert.throws(() => createBlockRules(Array.from({ length: 101 }, (_, i) => `d${i}.example`)), { name: 'RangeError' });
});
