import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parsePaginationParams } from '../commons/parsePaginationParams'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { StorageEntry } from '../../../types/commons'
import type { HTTPPaginatedResponse } from '../../../types/http'

/**
 * Handler for listing player storage values with pagination
 *
 * Results are paginated and ordered alphabetically by key (ASC) for deterministic pagination.
 * Each item is returned as { key, value }.
 *
 * @param context - Request context with worldName, params, components, and URL
 * @returns Paginated list of { key, value } entries
 */
export async function listPlayerStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values'>,
    'url' | 'components' | 'params' | 'worldName'
  >
): Promise<HTTPPaginatedResponse<StorageEntry[]>> {
  const {
    url,
    params,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('list-player-storage-handler')

  const playerAddress = params.player_address.toLowerCase()

  logger.debug('Processing list player storage request', { worldName, playerAddress })

  if (!EthAddress.validate(playerAddress)) {
    throw new InvalidRequestError('Invalid player address')
  }

  try {
    const { limit, offset, prefix } = parsePaginationParams(url)

    logger.debug('Parsed pagination params', { worldName, playerAddress, limit, offset, prefix: prefix ?? 'none' })

    // Fetch values and total count in parallel
    const [values, total] = await Promise.all([
      playerStorage.listValues(worldName, playerAddress, { limit, offset, prefix }),
      playerStorage.countKeys(worldName, playerAddress, { prefix })
    ])

    logger.info('Player storage values listed successfully', {
      worldName,
      playerAddress,
      count: values.length,
      total,
      limit,
      offset
    })

    return {
      status: 200,
      body: {
        data: values,
        pagination: { limit, offset, total }
      }
    }
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      throw error
    }

    logger.error('Error listing player storage values', {
      worldName,
      playerAddress,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
