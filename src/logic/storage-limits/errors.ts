/**
 * Error thrown when a storage operation would exceed configured size limits.
 *
 * This is a domain-level error that should be caught by HTTP handlers
 * and translated into the appropriate HTTP response (e.g. 400 Bad Request).
 */
export class StorageLimitExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageLimitExceededError'
  }
}
