import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../../utils/errors'
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

  try {
    const playerAddress = params.player_address.toLowerCase()
    const key = params.key

    if (!EthAddress.validate(playerAddress)) {
      throw new InvalidRequestError('Invalid player address')
    }

    if (!worldName || !playerAddress) {
      throw new InvalidRequestError('World name, player address, and key are required')
    }

    logger.info('Deleting player storage value', {
      worldName,
      playerAddress,
      key
    })

    await playerStorage.deleteValue(worldName, playerAddress, key)
    return {
      status: 204
    }
  } catch (error) {
    if (isInvalidRequestError(error)) {
      return {
        status: 400,
        body: {
          message: error.message
        }
      }
    }

    const errorMessage = errorMessageOrDefault(error, 'Unknown error')

    logger.error('Error deleting player storage value', {
      error: errorMessage
    })

    return {
      status: 500,
      body: {
        message: errorMessage
      }
    }
  }
}
