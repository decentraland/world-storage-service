import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { NotAuthorizedError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parseSearchParams } from '../commons/parseSearchParams'
import type { WatcherScene } from '../../../adapters/scene-logs-access/types'
import type { HandlerContextWithPath } from '../../../types'
import type { HTTPPaginatedResponse } from '../../../types/http'

/**
 * Handler for listing the scenes the signed-in wallet may watch (read-only discovery).
 *
 * Self-scoped off the recovered signer address (`ctx.verification.auth`) — there is no
 * address parameter, so a signer can only ever list its own scenes. Rows come from the
 * `scene_logs_access` discovery index and carry identifiers only, never storage values.
 *
 * @param context - Request context with url, components, and signature verification
 * @returns Paginated list of watchable scenes
 */
export async function getWatcherHandler(
  context: Pick<HandlerContextWithPath<'sceneLogsAccess' | 'logs', '/watcher'>, 'url' | 'components'> &
    DecentralandSignatureContext<Record<string, unknown>>
): Promise<HTTPPaginatedResponse<WatcherScene[]>> {
  const {
    url,
    components: { sceneLogsAccess, logs }
  } = context

  const logger = logs.getLogger('get-watcher-handler')

  const signerAddress = context.verification?.auth?.toLowerCase()
  if (!signerAddress) {
    throw new NotAuthorizedError('Unauthorized: No signer address found')
  }

  logger.debug('Processing watcher scenes request', { signerAddress })

  try {
    const { limit, offset } = parseSearchParams(url)

    const { data, total } = await sceneLogsAccess.listByAddress(signerAddress, limit, offset)

    logger.info('Watcher scenes listed successfully', { signerAddress, count: data.length, total, limit, offset })

    return {
      status: 200,
      body: {
        data,
        pagination: { limit, offset, total }
      }
    }
  } catch (error) {
    logger.error('Error listing watcher scenes', {
      signerAddress,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
