export function isErrorWithMessage(error: unknown): error is Error {
  return error !== undefined && error !== null && typeof error === 'object' && 'message' in error
}

export function errorMessageOrDefault(error: unknown, defaultMessage = 'Unknown error'): string {
  return isErrorWithMessage(error) ? error.message : defaultMessage
}
