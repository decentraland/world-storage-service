import { InvalidRequestError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parseSearchParams } from '../commons/parseSearchParams'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPPaginatedResponse } from '../../../types/http'

/**
 * Handler for listing all players that have stored values in a world with pagination
 *
 * Results are paginated and ordered alphabetically by player address (ASC) for deterministic pagination.
 * Each item is a player address string.
 *
 * @param context - Request context with worldName, components, and URL
 * @returns Paginated list of player address strings
 */
export async function listPlayersHandler(
  context: Pick<WorldHandlerContextWithPath<'logs' | 'playerStorage', '/players'>, 'url' | 'components' | 'worldName'>
): Promise<HTTPPaginatedResponse<string[]>> {
  const {
    url,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('list-players-handler')

  logger.debug('Processing list players request', { worldName })

  try {
    const { limit, offset } = parseSearchParams(url)

    logger.debug('Parsed pagination params', { worldName, limit, offset })

    // Fetch player addresses and total count in parallel
    const [players, total] = await Promise.all([
      playerStorage.listPlayers(worldName, { limit, offset }),
      playerStorage.countPlayers(worldName)
    ])

    logger.info('Players listed successfully', {
      worldName,
      count: players.length,
      total,
      limit,
      offset
    })

    return {
      status: 200,
      body: {
        data: players,
        pagination: { limit, offset, total }
      }
    }
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      throw error
    }

    logger.error('Error listing players', {
      worldName,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
