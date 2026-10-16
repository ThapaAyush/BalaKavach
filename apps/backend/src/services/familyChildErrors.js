export class ChildProfileNotFoundError extends Error {
  constructor() {
    super('Child profile not found.');
    this.name = 'ChildProfileNotFoundError';
    this.status = 404;
  }
}

export class FamilyChildStorageUnavailableError extends Error {
  constructor() {
    super('Child profiles are temporarily unavailable.');
    this.name = 'FamilyChildStorageUnavailableError';
    this.status = 503;
  }
}

export const childProfileNotFoundError = () => new ChildProfileNotFoundError();
