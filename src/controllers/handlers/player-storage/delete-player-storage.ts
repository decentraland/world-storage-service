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

  if (!EthAddress.validate(playerAddress)) {
    throw new InvalidRequestError('Invalid player address')
  }

  logger.info('Deleting player storage value', {
    worldName,
    playerAddress,
    key
  })

  try {
    await playerStorage.deleteValue(worldName, playerAddress, key)
    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error deleting player storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
