import { InvalidRequestError } from '@dcl/http-commons'
import { StorageLimitExceededError } from '../../../logic/storage-limits'
import { errorMessageOrDefault } from '../../../utils/errors'
import { rawJsonValueResponse } from '../../../utils/rawJsonResponse'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { RawJSONResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertWorldStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'worldStorage' | 'storageLimits', '/values/:key'>,
    'url' | 'components' | 'params' | 'request' | 'worldName' | 'placeId'
  >
): Promise<RawJSONResponse> {
  const {
    request,
    params,
    worldName,
    placeId,
    components: { logs, worldStorage, storageLimits }
  } = context

  const logger = logs.getLogger('upsert-world-storage-handler')

  const key = params.key

  logger.debug('Processing upsert world storage request', {
    worldName,
    key
  })

  const { value }: UpsertStorageBody = await request.json()

  try {
    // Validation serializes the value once and returns the JSON text; reuse it for the write and
    // the response so the value is never serialized more than once.
    const serializedValue = await storageLimits.validateWorldStorageUpsert(worldName, placeId, key, value)
    await worldStorage.setValue(worldName, placeId, key, serializedValue)

    logger.info('World storage value upserted successfully', {
      worldName,
      key
    })

    return rawJsonValueResponse(serializedValue)
  } catch (error) {
    if (error instanceof StorageLimitExceededError) {
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
