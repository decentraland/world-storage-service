import { InvalidRequestError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertEnvStorageBody } from '../schemas'

export async function upsertEnvStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'envStorage', '/env/:key'>,
    'url' | 'components' | 'params' | 'request'
  > &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('upsert-env-storage-handler')

  if (!worldName) {
    throw new InvalidRequestError('World name is required')
  }

  const key = params.key

  const { value }: UpsertEnvStorageBody = await request.json()

  logger.info('Upserting env storage value', {
    worldName,
    key
  })

  try {
    const item = await envStorage.setValue(worldName, key, value)
    return {
      status: 200,
      body: {
        value: item.value
      }
    }
  } catch (error) {
    logger.error('Error upserting env storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
