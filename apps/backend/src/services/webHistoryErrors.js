export class WebHistoryStorageUnavailableError extends Error {
  constructor(message = 'Web history storage is unavailable.') {
    super(message);
    this.name = 'WebHistoryStorageUnavailableError';
    this.status = 503;
    this.statusCode = 503;
  }
}
