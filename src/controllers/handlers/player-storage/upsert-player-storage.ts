import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertPlayerStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params' | 'request' | 'worldName'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('upsert-player-storage-handler')

  const playerAddress = params.player_address.toLowerCase()
  const key = params.key

  logger.debug('Processing upsert player storage request', {
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

  const { value }: UpsertStorageBody = await request.json()

  try {
    const item = await playerStorage.setValue(worldName, playerAddress, key, value)

    logger.info('Player storage value upserted successfully', {
      worldName,
      playerAddress,
      key
    })

    return {
      status: 200,
      body: {
        value: item.value
      }
    }
  } catch (error) {
    logger.error('Error upserting player storage value', {
      worldName,
      playerAddress,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
