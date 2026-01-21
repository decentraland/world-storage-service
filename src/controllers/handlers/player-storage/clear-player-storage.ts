import { errorMessageOrDefault } from '../../../utils/errors'
import { validateConfirmDeleteAllHeader } from '../commons/confirmDeleteAll'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function clearPlayerStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values'>,
    'url' | 'components' | 'worldName' | 'params' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    request,
    params,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('clear-player-storage-handler')

  validateConfirmDeleteAllHeader(request)

  const playerAddress = params.player_address.toLowerCase()

  logger.debug('Processing clear all player storage request', { worldName, playerAddress })

  try {
    await playerStorage.deleteAllForPlayer(worldName, playerAddress)

    logger.info('All player storage values deleted successfully', { worldName, playerAddress })

    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error clearing all player storage values', {
      worldName,
      playerAddress,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}

export async function clearAllPlayersStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage', '/players'>,
    'url' | 'components' | 'worldName' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    request,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('clear-all-players-storage-handler')

  validateConfirmDeleteAllHeader(request)

  logger.debug('Processing clear all players storage request', { worldName })

  try {
    await playerStorage.deleteAll(worldName)

    logger.info('All players storage values deleted successfully', { worldName })

    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error clearing all players storage values', {
      worldName,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
