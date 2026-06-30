import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { StorageLimitExceededError } from '../../../logic/storage-limits'
import { errorMessageOrDefault } from '../../../utils/errors'
import { rawJsonValueResponse } from '../../../utils/rawJsonResponse'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { RawJSONResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertPlayerStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage' | 'storageLimits', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params' | 'request' | 'worldName' | 'placeId'
  >
): Promise<RawJSONResponse> {
  const {
    request,
    params,
    worldName,
    placeId,
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
    // Validation serializes the value once and returns the JSON text; reuse it for the write and
    // the response so the value is never serialized more than once.
    const serializedValue = await storageLimits.validatePlayerStorageUpsert(
      worldName,
      placeId,
      playerAddress,
      key,
      value
    )
    await playerStorage.setValue(worldName, placeId, playerAddress, key, serializedValue)

    logger.info('Player storage value upserted successfully', {
      worldName,
      playerAddress,
      key
    })

    return rawJsonValueResponse(serializedValue)
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
