import { InvalidRequestError } from '@dcl/http-commons'
import { InvalidValueError, StorageLimitExceededError } from '../../../logic/storage-limits'
import { errorMessageOrDefault } from '../../../utils/errors'
import { rawJsonValueResponse } from '../../../utils/rawJsonResponse'
import { validateStorageKey } from '../commons/validateStorageKey'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { RawJSONResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertWorldStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'storageOperations', '/values/:key'>,
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

  const logger = logs.getLogger('upsert-world-storage-handler')

  const key = params.key
  validateStorageKey(key)

  logger.debug('Processing upsert world storage request', {
    worldName,
    key
  })

  const { value }: UpsertStorageBody = await request.json()

  try {
    // Validation and write run atomically inside the storage-operations transaction; the returned
    // JSON text is reused for the response so the value is never serialized more than once.
    const serializedValue = await storageOperations.upsertWorldValue(worldName, placeId, key, value)

    logger.info('World storage value upserted successfully', {
      worldName,
      key
    })

    return rawJsonValueResponse(serializedValue)
  } catch (error) {
    if (error instanceof StorageLimitExceededError || error instanceof InvalidValueError) {
      throw new InvalidRequestError(error.message)
    }

    logger.error('Error upserting world storage value', {
      worldName,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
