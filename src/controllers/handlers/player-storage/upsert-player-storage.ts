import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { InvalidValueError, StorageLimitExceededError } from '../../../logic/storage-limits'
import { errorMessageOrDefault } from '../../../utils/errors'
import { rawJsonValueResponse } from '../../../utils/rawJsonResponse'
import { validateStorageKey } from '../commons/validateStorageKey'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { RawJSONResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertPlayerStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'storageOperations', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params' | 'request' | 'worldName' | 'placeId'
  >
): Promise<RawJSONResponse> {
  const {
    request,
    params,
    worldName,
    placeId,
    components: { logs, storageOperations }
  } = context

  const logger = logs.getLogger('upsert-player-storage-handler')

  const playerAddress = params.player_address.toLowerCase()
  const key = params.key
  validateStorageKey(key)

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
    // Validation and write run atomically inside the storage-operations transaction; the returned
    // JSON text is reused for the response so the value is never serialized more than once.
    const serializedValue = await storageOperations.upsertPlayerValue(worldName, placeId, playerAddress, key, value)

    logger.info('Player storage value upserted successfully', {
      worldName,
      playerAddress,
      key
    })

    return rawJsonValueResponse(serializedValue)
  } catch (error) {
    if (error instanceof StorageLimitExceededError || error instanceof InvalidValueError) {
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
