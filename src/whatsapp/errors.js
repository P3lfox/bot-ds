export class WhatsAppUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WhatsAppUnavailableError';
  }
}
