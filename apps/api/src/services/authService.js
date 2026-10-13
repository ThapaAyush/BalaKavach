import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { env } from '../config/env.js';
import { mongoAuthRepository } from './authRepository.js';
import { invalidCredentialsError } from './authErrors.js';

const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
});
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,p=1,t=3$W0GBmEbvPK51J2MRgwfr4g$QabrC1XJsP2YpOeYoxc0PRIOf3r/Hn23AnLdQxiRLjI';
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const AUTH_SESSION_TTL_MS = env.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000;

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function toPublicParent(parent) {
  const id = parent.id ?? parent._id?.toString();
  return { id, email: parent.email };
}

export function createAuthService({
  repository = mongoAuthRepository,
  sessionTtlMs = AUTH_SESSION_TTL_MS,
  now = () => new Date(),
  hashPassword = (password) => argon2.hash(password, ARGON2_OPTIONS),
  verifyPassword = (hash, password) => argon2.verify(hash, password),
} = {}) {
  return Object.freeze({
    async register({ email, password }) {
      repository.assertAvailable?.();
      const passwordHash = await hashPassword(password);

      try {
        await repository.createParent({ email, passwordHash });
      } catch (error) {
        // Do not let duplicate registration reveal whether an account exists.
        const duplicateEmail = error?.code === 11000
          && (error.keyPattern?.email === 1 || error.keyValue?.email === email);
        if (duplicateEmail) return;
        throw error;
      }
    },

    async login({ email, password }) {
      repository.assertAvailable?.();
      const parent = await repository.findParentByEmail(email);
      const hash = parent?.passwordHash ?? await DUMMY_PASSWORD_HASH;
      const passwordMatches = await verifyPassword(hash, password);

      if (!parent || !passwordMatches) throw invalidCredentialsError();

      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now().getTime() + sessionTtlMs);
      await repository.createSession({
        parentId: parent.id ?? parent._id?.toString(),
        tokenHash: hashSessionToken(token),
        expiresAt,
      });

      return { parent: toPublicParent(parent), token, expiresAt };
    },

    async authenticate(token) {
      if (typeof token !== 'string' || !SESSION_TOKEN_PATTERN.test(token)) return null;

      const session = await repository.findActiveSession(hashSessionToken(token), now());
      return session?.parent ? toPublicParent(session.parent) : null;
    },

    async logout(token) {
      if (typeof token !== 'string' || !SESSION_TOKEN_PATTERN.test(token)) return;
      await repository.deleteSession(hashSessionToken(token));
    },
  });
}

export const authService = createAuthService();
