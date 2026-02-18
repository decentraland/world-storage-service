import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { StorageLimitExceededError } from '../../../logic/storage-limits'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertPlayerStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage' | 'storageLimits', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params' | 'request' | 'worldName'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, playerStorage, storageLimits }
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
    throw new InvalidRequestError('Invalid player address')
  }

  const { value }: UpsertStorageBody = await request.json()

  try {
    await storageLimits.validatePlayerStorageUpsert(worldName, playerAddress, key, value)
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
    if (error instanceof StorageLimitExceededError) {
      throw new InvalidRequestError(error.message)
    }

    logger.error('Error upserting player storage value', {
      worldName,
      playerAddress,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
