import { InvalidRequestError, NotAuthorizedError } from '@dcl/http-commons'

export { InvalidRequestError, NotAuthorizedError }

export function isErrorWithMessage(error: unknown): error is Error {
  return error !== undefined && error !== null && typeof error === 'object' && 'message' in error
}

export function errorMessageOrDefault(error: unknown, defaultMessage = 'Unknown error'): string {
  return isErrorWithMessage(error) ? error.message : defaultMessage
}

export function isInvalidRequestError(error: unknown): error is InvalidRequestError {
  return error instanceof InvalidRequestError
}

export function isNotAuthorizedError(error: unknown): error is NotAuthorizedError {
  return error instanceof NotAuthorizedError
}
