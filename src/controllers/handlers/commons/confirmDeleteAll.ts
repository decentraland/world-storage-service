import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { MissingRequiredHeaderError } from './errors'

const CONFIRM_DELETE_ALL_HEADER = 'X-Confirm-Delete-All'

/**
 * Validates the presence of the X-Confirm-Delete-All header.
 * This header is required for bulk delete operations to prevent accidental data loss.
 * @throws MissingRequiredHeaderError if the header is not present
 */
export function validateConfirmDeleteAllHeader(request: IHttpServerComponent.IRequest): void {
  const confirmHeader = request.headers.get(CONFIRM_DELETE_ALL_HEADER)
  if (!confirmHeader) {
    throw new MissingRequiredHeaderError(CONFIRM_DELETE_ALL_HEADER)
  }
}
