import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function deletePlayerStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params' | 'worldName'
  >
): Promise<HTTPResponse> {
  const {
    params,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('delete-player-storage-handler')

  const playerAddress = params.player_address.toLowerCase()
  const key = params.key

  logger.debug('Processing delete player storage request', {
    worldName,
    playerAddress,
    key
  })

  if (!EthAddress.validate(playerAddress)) {
    throw new InvalidRequestError('Invalid player address')
  }

  try {
    await playerStorage.deleteValue(worldName, playerAddress, key)

    logger.info('Player storage value deleted successfully', {
      worldName,
      playerAddress,
      key
    })

    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error deleting player storage value', {
      worldName,
      playerAddress,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
