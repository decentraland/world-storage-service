import { InvalidRequestError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parsePaginationParams } from '../commons/parsePaginationParams'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPPaginatedResponse } from '../../../types/http'

/**
 * Handler for listing environment variable keys (names only, no values)
 *
 * This endpoint returns only key names to protect secrets. Values are never exposed.
 * Results are paginated and ordered alphabetically by key (ASC) for deterministic pagination.
 *
 * Authorization: Owners and deployers only
 *
 * @param context - Request context with worldName, components, and URL
 * @returns Paginated list of key names
 */
export async function listEnvKeysHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'envStorage' | 'config', '/env'>,
    'url' | 'components' | 'worldName'
  >
): Promise<HTTPPaginatedResponse<string[]>> {
  const {
    url,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('list-env-keys-handler')

  logger.debug('Processing list env keys request', { worldName })

  try {
    const { limit, offset, prefix } = parsePaginationParams(url)

    logger.debug('Parsed pagination params', { worldName, limit, offset, prefix: prefix ?? 'none' })

    // Fetch keys and total count in parallel
    const [keys, total] = await Promise.all([
      envStorage.listKeys(worldName, { limit, offset, prefix }),
      envStorage.countKeys(worldName, { prefix })
    ])

    logger.info('Env keys listed successfully', {
      worldName,
      count: keys.length,
      total,
      limit,
      offset
    })

    return {
      status: 200,
      body: {
        data: keys,
        pagination: { limit, offset, total }
      }
    }
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      throw error
    }

    logger.error('Error listing env keys', {
      worldName,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
