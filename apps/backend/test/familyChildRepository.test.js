import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { upsertFamilyWithDuplicateRecovery } from '../src/services/familyChildRepository.js';

describe('family upsert duplicate-key recovery', () => {
  it('loads the unique owner family after a simultaneous upsert wins the insert race', async () => {
    const duplicateKeyError = Object.assign(new Error('duplicate key'), {
      code: 11000,
      keyPattern: { ownerParentId: 1 },
    });
    const existingFamily = { _id: 'family-id', ownerParentId: 'parent-id' };
    let reads = 0;

    const result = await upsertFamilyWithDuplicateRecovery(
      async () => { throw duplicateKeyError; },
      async () => { reads += 1; return existingFamily; },
    );

    assert.equal(result, existingFamily);
    assert.equal(reads, 1);
  });

  it('preserves the duplicate-key error when no family for that owner can be found', async () => {
    const duplicateKeyError = Object.assign(new Error('duplicate key'), {
      code: 11000,
      keyPattern: { ownerParentId: 1 },
    });

    await assert.rejects(
      upsertFamilyWithDuplicateRecovery(async () => { throw duplicateKeyError; }, async () => null),
      (error) => error === duplicateKeyError,
    );
  });

  it('does not convert unrelated upsert errors into a family lookup', async () => {
    const databaseError = new Error('database failure');
    let reads = 0;

    await assert.rejects(
      upsertFamilyWithDuplicateRecovery(async () => { throw databaseError; }, async () => { reads += 1; }),
      (error) => error === databaseError,
    );
    assert.equal(reads, 0);
  });

  it('does not mistake a duplicate on another unique index for an owner race', async () => {
    const duplicateIdError = Object.assign(new Error('duplicate key'), {
      code: 11000,
      keyPattern: { _id: 1 },
    });
    let reads = 0;

    await assert.rejects(
      upsertFamilyWithDuplicateRecovery(
        async () => { throw duplicateIdError; },
        async () => { reads += 1; return { _id: 'existing-family' }; },
      ),
      (error) => error === duplicateIdError,
    );
    assert.equal(reads, 0);
  });
});
