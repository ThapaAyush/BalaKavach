export class AuthHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AuthHttpError';
    this.status = status;
  }
}

export class AuthDatabaseUnavailableError extends Error {
  constructor() {
    super('Authentication is temporarily unavailable.');
    this.name = 'AuthDatabaseUnavailableError';
    this.status = 503;
  }
}

export const invalidCredentialsError = () => new AuthHttpError(
  401,
  'Email or password is incorrect.',
);
