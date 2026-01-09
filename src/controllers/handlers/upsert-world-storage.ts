import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../utils/errors'
import type { UpsertStorageBody } from './schemas'
import type { HandlerContextWithPath, WorldStorageContext } from '../../types'
import type { HTTPResponse } from '../../types/http'

export async function upsertWorldStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'worldStorage', '/values/:key'>,
    'url' | 'components' | 'params' | 'request'
  > &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('upsert-world-storage-handler')

  try {
    const key = params.key

    if (!worldName || !key) {
      throw new InvalidRequestError('World name and key are required')
    }

    const { value }: UpsertStorageBody = await request.json()

    logger.info('Upserting world storage value', {
      worldName,
      key
    })

    const item = await worldStorage.setValue(worldName, key, value)
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

    logger.error('Error upserting world storage value', {
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
