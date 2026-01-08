export function isErrorWithMessage(error: unknown): error is Error {
  return error !== undefined && error !== null && typeof error === 'object' && 'message' in error
}

export function errorMessageOrDefault(error: unknown, defaultMessage = 'Unknown error'): string {
  return isErrorWithMessage(error) ? error.message : defaultMessage
}

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidRequestError'
  }
}

export function isInvalidRequestError(error: unknown): error is InvalidRequestError {
  return error instanceof InvalidRequestError
}
