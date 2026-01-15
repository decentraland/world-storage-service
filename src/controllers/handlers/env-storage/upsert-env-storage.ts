import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../../utils/errors'
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

  try {
    if (!worldName) {
      throw new InvalidRequestError('World name is required')
    }

    const key = params.key

    const { value }: UpsertEnvStorageBody = await request.json()

    logger.info('Upserting env storage value', {
      worldName,
      key
    })

    const item = await envStorage.setValue(worldName, key, value)
    return {
      status: 200,
      body: {
        value: item.value
      }
    }
  } catch (error) {
    if (isInvalidRequestError(error)) {
      return {
        status: 400,
        body: {
          message: error.message
        }
      }
    }

    const errorMessage = errorMessageOrDefault(error, 'Unknown error')

    logger.error('Error upserting env storage value', {
      error: errorMessage
    })

    return {
      status: 500,
      body: {
        message: errorMessage
      }
    }
  }
}
