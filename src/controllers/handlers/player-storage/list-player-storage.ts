import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../../utils/errors'
import { rawJsonPaginatedResponse } from '../../../utils/rawJsonResponse'
import { parseSearchParams } from '../commons/parseSearchParams'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { RawJSONResponse } from '../../../types/http'

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
    'url' | 'components' | 'params' | 'worldName' | 'placeId'
  >
): Promise<RawJSONResponse> {
  const {
    url,
    params,
    worldName,
    placeId,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('list-player-storage-handler')

  const playerAddress = params.player_address.toLowerCase()

  logger.debug('Processing list player storage request', { worldName, playerAddress })

  if (!EthAddress.validate(playerAddress)) {
    throw new InvalidRequestError('Invalid player address')
  }

  try {
    const { limit, offset, prefix } = parseSearchParams(url)

    logger.debug('Parsed pagination params', { worldName, playerAddress, limit, offset, prefix: prefix ?? 'none' })

    // Fetch the page (already serialized as JSON array text) and the total count in parallel.
    const [data, total] = await Promise.all([
      playerStorage.listValues(worldName, placeId, playerAddress, { limit, offset, prefix }),
      playerStorage.countKeys(worldName, placeId, playerAddress, { prefix })
    ])

    logger.info('Player storage values listed successfully', {
      worldName,
      playerAddress,
      total,
      limit,
      offset
    })

    return rawJsonPaginatedResponse(data, { limit, offset, total })
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
