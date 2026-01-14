import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../types'
import type { HTTPResponse } from '../../types/http'

export async function deleteEnvStorageHandler(
  context: Pick<HandlerContextWithPath<'logs' | 'envStorage', '/env/:key'>, 'url' | 'components' | 'params'> &
    WorldStorageContext
): Promise<HTTPResponse> {
  const {
    params,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('delete-env-storage-handler')

  try {
    if (!worldName) {
      throw new InvalidRequestError('World name is required')
    }

    const key = params.key

    if (!key) {
      throw new InvalidRequestError('Key is required')
    }

    logger.info('Deleting env storage value', {
      worldName,
      key
    })

    await envStorage.deleteValue(worldName, key)
    return {
      status: 204
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

    logger.error('Error deleting env storage value', {
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
