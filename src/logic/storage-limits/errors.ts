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

/**
 * Error thrown when a value cannot be stored regardless of its size
 * (e.g. it contains NUL characters, which Postgres `jsonb` cannot hold).
 *
 * This is a domain-level error that should be caught by HTTP handlers
 * and translated into the appropriate HTTP response (e.g. 400 Bad Request).
 */
export class InvalidValueError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidValueError'
  }
}
