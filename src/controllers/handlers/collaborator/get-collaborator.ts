import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { NotAuthorizedError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parseSearchParams } from '../commons/parseSearchParams'
import type { CollaboratorScene } from '../../../adapters/scene-collaborators/types'
import type { HandlerContextWithPath } from '../../../types'
import type { HTTPPaginatedResponse } from '../../../types/http'

/**
 * Handler for listing the scenes the signed-in wallet may watch (read-only discovery).
 *
 * Self-scoped off the recovered signer address (`ctx.verification.auth`) — there is no
 * address parameter, so a signer can only ever list its own scenes. Rows come from the
 * `scene_collaborators` discovery index and carry identifiers only, never storage values.
 *
 * @param context - Request context with url, components, and signature verification
 * @returns Paginated list of watchable scenes
 */
export async function getCollaboratorHandler(
  context: Pick<HandlerContextWithPath<'sceneCollaborators' | 'logs', '/collaborator'>, 'url' | 'components'> &
    DecentralandSignatureContext<Record<string, unknown>>
): Promise<HTTPPaginatedResponse<CollaboratorScene[]>> {
  const {
    url,
    components: { sceneCollaborators, logs }
  } = context

  const logger = logs.getLogger('get-collaborator-handler')

  const signerAddress = context.verification?.auth?.toLowerCase()
  if (!signerAddress) {
    throw new NotAuthorizedError('Unauthorized: No signer address found')
  }

  logger.debug('Processing collaborator scenes request', { signerAddress })

  try {
    const { limit, offset } = parseSearchParams(url)

    const { data, total } = await sceneCollaborators.listByAddress(signerAddress, limit, offset)

    logger.info('Collaborator scenes listed successfully', { signerAddress, count: data.length, total, limit, offset })

    return {
      status: 200,
      body: {
        data,
        pagination: { limit, offset, total }
      }
    }
  } catch (error) {
    logger.error('Error listing collaborator scenes', {
      signerAddress,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
