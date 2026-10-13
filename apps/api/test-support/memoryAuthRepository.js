import { randomUUID } from 'node:crypto';

export function createMemoryAuthRepository() {
  const parentsById = new Map();
  const parentIdsByEmail = new Map();
  const sessionsByTokenHash = new Map();

  return {
    async createParent({ email, passwordHash }) {
      if (parentIdsByEmail.has(email)) {
        const error = new Error('Duplicate email index.');
        error.code = 11000;
        error.keyPattern = { email: 1 };
        error.keyValue = { email };
        throw error;
      }

      const parent = { id: randomUUID(), email, passwordHash };
      parentsById.set(parent.id, parent);
      parentIdsByEmail.set(email, parent.id);
      return { ...parent };
    },

    async findParentByEmail(email) {
      const id = parentIdsByEmail.get(email);
      const parent = id ? parentsById.get(id) : null;
      return parent ? { ...parent } : null;
    },

    async createSession(session) {
      sessionsByTokenHash.set(session.tokenHash, { ...session });
    },

    async findActiveSession(tokenHash, now) {
      const session = sessionsByTokenHash.get(tokenHash);
      if (!session || session.expiresAt <= now) return null;

      const parent = parentsById.get(session.parentId);
      return parent ? { parent: { id: parent.id, email: parent.email } } : null;
    },

    async deleteSession(tokenHash) {
      sessionsByTokenHash.delete(tokenHash);
    },

    expireSessions() {
      for (const session of sessionsByTokenHash.values()) {
        session.expiresAt = new Date(0);
      }
    },

    clear() {
      parentsById.clear();
      parentIdsByEmail.clear();
      sessionsByTokenHash.clear();
    },

    getParentByEmail(email) {
      const id = parentIdsByEmail.get(email);
      const parent = id ? parentsById.get(id) : null;
      return parent ? { ...parent } : null;
    },

    getSessionTokenHashes() {
      return [...sessionsByTokenHash.keys()];
    },

    getSessionCount() {
      return sessionsByTokenHash.size;
    },
  };
}
