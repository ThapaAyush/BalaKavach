export class InvalidPairingCodeError extends Error {
  constructor() {
    super('Pairing code is invalid or unavailable.');
    this.name = 'InvalidPairingCodeError';
    this.status = 400;
  }
}

export class PairingCodeNotFoundError extends Error {
  constructor() {
    super('Pairing code not found.');
    this.name = 'PairingCodeNotFoundError';
    this.status = 404;
  }
}

export class DeviceNotFoundError extends Error {
  constructor() {
    super('Device not found.');
    this.name = 'DeviceNotFoundError';
    this.status = 404;
  }
}

export class DevicePairingStorageUnavailableError extends Error {
  constructor() {
    super('Device pairing is temporarily unavailable.');
    this.name = 'DevicePairingStorageUnavailableError';
    this.status = 503;
  }
}

export class DeviceAuthenticationError extends Error {
  constructor() {
    super('Device authentication required.');
    this.name = 'DeviceAuthenticationError';
    this.status = 401;
  }
}

export const invalidPairingCodeError = () => new InvalidPairingCodeError();
export const pairingCodeNotFoundError = () => new PairingCodeNotFoundError();
export const deviceNotFoundError = () => new DeviceNotFoundError();
export const deviceAuthenticationError = () => new DeviceAuthenticationError();
