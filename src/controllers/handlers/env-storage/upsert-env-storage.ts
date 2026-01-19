import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertEnvStorageBody } from '../schemas'

export async function upsertEnvStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'envStorage', '/env/:key'>,
    'url' | 'components' | 'params' | 'request' | 'worldName'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('upsert-env-storage-handler')

  const key = params.key

  const { value }: UpsertEnvStorageBody = await request.json()

  logger.debug('Processing upsert env storage request', {
    worldName,
    key
  })

  try {
    await envStorage.setValue(worldName, key, value)

    logger.info('Env variable upserted successfully', {
      worldName,
      key
    })

    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error upserting env variable', {
      worldName,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
