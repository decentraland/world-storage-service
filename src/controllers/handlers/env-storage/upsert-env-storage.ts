import { InvalidRequestError } from '@dcl/http-commons'
import { StorageLimitExceededError } from '../../../logic/storage-limits'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertEnvStorageBody } from '../schemas'

export async function upsertEnvStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'envStorage' | 'storageLimits', '/env/:key'>,
    'url' | 'components' | 'params' | 'request' | 'worldName'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, envStorage, storageLimits }
  } = context

  const logger = logs.getLogger('upsert-env-storage-handler')

  const key = params.key

  const { value }: UpsertEnvStorageBody = await request.json()

  logger.debug('Processing upsert env storage request', {
    worldName,
    key
  })

  try {
    await storageLimits.validateEnvStorageUpsert(worldName, key, value)
    await envStorage.setValue(worldName, key, value)

    logger.info('Env variable upserted successfully', {
      worldName,
      key
    })

    return {
      status: 204
    }
  } catch (error) {
    if (error instanceof StorageLimitExceededError) {
      throw new InvalidRequestError(error.message)
    }

    logger.error('Error upserting env variable', {
      worldName,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
