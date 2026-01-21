import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/http-commons'

const CONFIRM_DELETE_ALL_HEADER = 'X-Confirm-Delete-All'

/**
 * Validates the presence of the X-Confirm-Delete-All header.
 * This header is required for bulk delete operations to prevent accidental data loss.
 * @throws InvalidRequestError if the header is not present
 */
export function validateConfirmDeleteAllHeader(request: IHttpServerComponent.IRequest): void {
  const confirmHeader = request.headers.get(CONFIRM_DELETE_ALL_HEADER)
  if (!confirmHeader) {
    throw new InvalidRequestError(`Missing required header: ${CONFIRM_DELETE_ALL_HEADER}`)
  }
}
