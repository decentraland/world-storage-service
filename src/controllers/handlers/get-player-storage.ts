import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../types'
import type { HTTPResponse } from '../../types/http'

export async function getPlayerStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params'
  > &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('get-player-storage-handler')

  try {
    const playerAddress = params.player_address
    const key = params.key

    if (!worldName || !playerAddress || !key) {
      throw new InvalidRequestError('World name, player address, and key are required')
    }

    logger.info('Getting player storage value', {
      worldName,
      playerAddress,
      key
    })

    const value = await playerStorage.getValue(worldName, playerAddress, key)

    if (value === null) {
      return {
        status: 404,
        body: {
          message: 'Value not found'
        }
      }
    }

    return {
      status: 200,
      body: {
        value
      }
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

    logger.error('Error getting player storage value', {
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
