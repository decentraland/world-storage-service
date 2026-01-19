import { InvalidRequestError, NotFoundError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function getPlayerStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params' | 'worldName'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('get-player-storage-handler')

  const playerAddress = params.player_address.toLowerCase()
  const key = params.key

  logger.debug('Processing get player storage request', {
    worldName,
    playerAddress,
    key
  })

  if (!EthAddress.validate(playerAddress)) {
    logger.warn('Invalid player address in request', {
      worldName,
      playerAddress,
      key
    })
    throw new InvalidRequestError('Invalid player address')
  }

  try {
    const value = await playerStorage.getValue(worldName, playerAddress, key)

    if (!value) {
      logger.info('Player storage value not found', {
        worldName,
        playerAddress,
        key
      })
      throw new NotFoundError('Value not found')
    }

    logger.info('Player storage value retrieved successfully', {
      worldName,
      playerAddress,
      key
    })

    return {
      status: 200,
      body: {
        value
      }
    }
  } catch (error) {
    // Only log as error if it's not a NotFoundError (which is expected behavior)
    if (error instanceof NotFoundError) {
      throw error
    }

    logger.error('Error getting player storage value', {
      worldName,
      playerAddress,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
