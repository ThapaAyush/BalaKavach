export class PolicyNotFoundError extends Error {
  constructor() {
    super('Policy not found.');
    this.name = 'PolicyNotFoundError';
    this.status = 404;
  }
}

export class PolicyStorageUnavailableError extends Error {
  constructor() {
    super('Policy storage is temporarily unavailable.');
    this.name = 'PolicyStorageUnavailableError';
    this.status = 503;
  }
}

export const policyNotFoundError = () => new PolicyNotFoundError();
export const policyStorageUnavailableError = () => new PolicyStorageUnavailableError();
