import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import {
  getSessionCookieName,
  sessionCookieOptions,
} from '../src/utils/sessionCookie.js';

describe('Production Readiness & Deployment Configuration', () => {
  describe('Environment Schema (envSchema)', () => {
    it('accepts and normalizes valid production configuration', () => {
      const parsed = envSchema.safeParse({
        NODE_ENV: 'production',
        PORT: '10000',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/test',
        CLIENT_ORIGIN: 'https://app.kidsguard.example.com/',
        AUTH_SESSION_TTL_HOURS: '72',
        TRUST_PROXY: '1',
        SESSION_COOKIE_SAME_SITE: 'strict',
      });

      assert.equal(parsed.success, true);
      assert.equal(parsed.data.NODE_ENV, 'production');
      assert.equal(parsed.data.PORT, 10000);
      assert.equal(parsed.data.CLIENT_ORIGIN, 'https://app.kidsguard.example.com');
      assert.equal(parsed.data.AUTH_SESSION_TTL_HOURS, 72);
      assert.equal(parsed.data.TRUST_PROXY, 1);
      assert.equal(parsed.data.SESSION_COOKIE_SAME_SITE, 'strict');
    });

    it('trims trailing slashes from CLIENT_ORIGIN to prevent CSRF origin mismatch', () => {
      const withSlash = envSchema.safeParse({
        CLIENT_ORIGIN: 'https://dashboard.example.com///',
      });
      assert.equal(withSlash.success, true);
      assert.equal(withSlash.data.CLIENT_ORIGIN, 'https://dashboard.example.com');
    });

    it('rejects invalid ports, negative trust proxy, and unknown sameSite modes without leaking values', () => {
      const invalid = envSchema.safeParse({
        PORT: '99999',
        TRUST_PROXY: '-1',
        SESSION_COOKIE_SAME_SITE: 'invalid_mode',
        CLIENT_ORIGIN: 'not-a-url',
      });

      assert.equal(invalid.success, false);
      const fields = invalid.error.issues.map((i) => i.path.join('.'));
      assert.ok(fields.includes('PORT'));
      assert.ok(fields.includes('TRUST_PROXY'));
      assert.ok(fields.includes('SESSION_COOKIE_SAME_SITE'));
      assert.ok(fields.includes('CLIENT_ORIGIN'));
    });
  });

  describe('Reverse Proxy Trust & Rate Limiter IP Resolution', () => {
    it('defaults trust proxy to 1 in production and 0 in development/test', () => {
      const prodApp = createApp({
        runtimeEnv: { NODE_ENV: 'production', CLIENT_ORIGIN: 'https://app.example.com' },
      });
      assert.equal(prodApp.get('trust proxy'), 1);

      const devApp = createApp({
        runtimeEnv: { NODE_ENV: 'development', CLIENT_ORIGIN: 'http://localhost:5173' },
      });
      assert.equal(devApp.get('trust proxy'), false);

      const explicitApp = createApp({
        runtimeEnv: { NODE_ENV: 'production', CLIENT_ORIGIN: 'https://app.example.com', TRUST_PROXY: 2 },
      });
      assert.equal(explicitApp.get('trust proxy'), 2);
    });

    it('allows rate-limited health checks behind a reverse proxy with X-Forwarded-For when trust proxy is 1', async () => {
      const prodApp = createApp({
        runtimeEnv: {
          NODE_ENV: 'production',
          CLIENT_ORIGIN: 'https://app.example.com',
          TRUST_PROXY: 1,
        },
      });

      // Simulation: Render proxy forwards request with client IP
      const res = await request(prodApp)
        .get('/api/v1/health')
        .set('X-Forwarded-For', '198.51.100.1, 203.0.113.195')
        .expect(200);

      assert.equal(res.body.ok, true);
      assert.equal(res.body.data.service, 'kidsguard-api');
    });

    it('evaluates client IP from rightmost hop when trust proxy is 1 and ignores spoofed client-side hops', async () => {
      const testServer = express();
      testServer.set('trust proxy', 1);
      testServer.get('/test-ip', (req, res) => {
        res.json({ ip: req.ip });
      });

      // Spoofed upstream 1.1.1.1, real client appended by reverse proxy 203.0.113.50
      const res = await request(testServer)
        .get('/test-ip')
        .set('X-Forwarded-For', '1.1.1.1, 203.0.113.50')
        .expect(200);

      assert.equal(res.body.ip, '203.0.113.50');
    });
  });

  describe('Session Cookie Options & Host-Prefix Preservation', () => {
    it('enforces __Host- prefix and SameSite=Strict in production', () => {
      assert.equal(getSessionCookieName('production'), '__Host-kidsguard_session');
      assert.equal(getSessionCookieName('development'), 'kidsguard_session');

      const prodOptions = sessionCookieOptions('production', 'strict');
      assert.equal(prodOptions.httpOnly, true);
      assert.equal(prodOptions.secure, true);
      assert.equal(prodOptions.sameSite, 'strict');
      assert.equal(prodOptions.path, '/');
    });

    it('enforces Secure when sameSite is none even in non-production environments', () => {
      const crossSiteOptions = sessionCookieOptions('development', 'none');
      assert.equal(crossSiteOptions.sameSite, 'none');
      assert.equal(crossSiteOptions.secure, true);
    });

    it('defaults to strict when sameSite is omitted', () => {
      const defaultOptions = sessionCookieOptions('development');
      assert.equal(defaultOptions.sameSite, 'strict');
      assert.equal(defaultOptions.secure, false);
    });
  });
});
