import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { NotAuthorizedError } from '@dcl/http-commons'
import type { ExportJobScope } from '../../../adapters/export-jobs'

/**
 * Builds the export job scope from the scene context and the lowercased signer.
 *
 * @throws {NotAuthorizedError} If the request carries no signer address
 */
export function getExportJobScope(
  context: { worldName: string; placeId: string } & Pick<DecentralandSignatureContext, 'verification'>
): ExportJobScope {
  const requestedBy = context.verification?.auth?.toLowerCase()
  if (!requestedBy) {
    throw new NotAuthorizedError('Unauthorized: No signer address found')
  }
  return { worldName: context.worldName, placeId: context.placeId, requestedBy }
}
