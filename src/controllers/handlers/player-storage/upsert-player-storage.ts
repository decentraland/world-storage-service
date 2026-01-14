import { EthAddress } from '@dcl/schemas'
import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertPlayerStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params' | 'request'
  > &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('upsert-player-storage-handler')

  try {
    const playerAddress = params.player_address.toLowerCase()
    const key = params.key

    if (!EthAddress.validate(playerAddress)) {
      throw new InvalidRequestError('Invalid player address')
    }

    if (!worldName || !playerAddress || !key) {
      throw new InvalidRequestError('World name, player address, and key are required')
    }

    const { value }: UpsertStorageBody = await request.json()

    logger.info('Upserting player storage value', {
      worldName,
      playerAddress,
      key
    })

    const item = await playerStorage.setValue(worldName, playerAddress, key, value)
    return {
      status: 200,
      body: {
        value: item.value
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

    logger.error('Error upserting player storage value', {
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
