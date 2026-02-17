import { InvalidRequestError } from '@dcl/http-commons'
import { StorageLimitExceededError } from '../../../logic/storage-limits'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertWorldStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'worldStorage' | 'storageLimits', '/values/:key'>,
    'url' | 'components' | 'params' | 'request' | 'worldName'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
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
    await storageLimits.validateWorldStorageUpsert(worldName, key, value)
    const item = await worldStorage.setValue(worldName, key, value)

    logger.info('World storage value upserted successfully', {
      worldName,
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

    logger.error('Error upserting world storage value', {
      worldName,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
