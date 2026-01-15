import { InvalidRequestError } from '@dcl/platform-server-commons'
import { EthAddress } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function deletePlayerStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params'
  > &
    WorldStorageContext
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

  if (!worldName || !playerAddress) {
    throw new InvalidRequestError('World name and player address are required')
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
