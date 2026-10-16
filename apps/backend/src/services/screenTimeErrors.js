export class ScreenTimeStorageUnavailableError extends Error {
  constructor() {
    super('Screen time storage is temporarily unavailable.');
    this.name = 'ScreenTimeStorageUnavailableError';
    this.status = 503;
  }
}

export const screenTimeStorageUnavailableError = () => new ScreenTimeStorageUnavailableError();
