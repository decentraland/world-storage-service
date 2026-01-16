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

  if (!EthAddress.validate(playerAddress)) {
    throw new InvalidRequestError('Invalid player address')
  }

  logger.info('Getting player storage value', {
    worldName,
    playerAddress,
    key
  })

  try {
    const value = await playerStorage.getValue(worldName, playerAddress, key)

    if (!value) {
      throw new NotFoundError('Value not found')
    }

    return {
      status: 200,
      body: {
        value
      }
    }
  } catch (error) {
    logger.error('Error getting player storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
