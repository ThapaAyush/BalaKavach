import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
});

test('creates only top-level navigation blocking rules with a dedicated ID range', () => {
  assert.deepEqual(createBlockRules(['b.example', 'a.example']), [
    { id: 1000, priority: 1, action: { type: 'block' }, condition: { requestDomains: ['a.example'], resourceTypes: ['main_frame'] } },
    { id: 1001, priority: 1, action: { type: 'block' }, condition: { requestDomains: ['b.example'], resourceTypes: ['main_frame'] } }
  ]);
  assert.throws(() => createBlockRules(Array.from({ length: 101 }, (_, i) => `d${i}.example`)), { name: 'RangeError' });
});
