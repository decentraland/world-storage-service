import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function getEnvStorageHandler(
  context: Pick<HandlerContextWithPath<'logs' | 'envStorage', '/env/:key'>, 'url' | 'components' | 'params'> &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('get-env-storage-handler')

  try {
    if (!worldName) {
      throw new InvalidRequestError('World name is required')
    }

    const key = params.key

    logger.info('Getting env storage value', {
      worldName,
      key
    })

    const value = await envStorage.getValue(worldName, key)

    if (value === null) {
      return {
        status: 404,
        body: {
          message: 'Value not found'
        }
      }
    }

    return {
      status: 200,
      body: {
        value
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

    logger.error('Error getting env storage value', {
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
