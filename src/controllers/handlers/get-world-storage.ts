import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../types'
import type { HTTPResponse } from '../../types/http'

export async function getWorldStorageHandler(
  context: Pick<HandlerContextWithPath<'logs' | 'worldStorage', '/values/:key'>, 'url' | 'components' | 'params'> &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('get-world-storage-handler')

  try {
    const key = params.key

    if (!worldName || !key) {
      throw new InvalidRequestError('World name and key are required')
    }

    logger.info('Getting world storage value', {
      worldName,
      key
    })

    const value = await worldStorage.getValue(worldName, key)

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

    logger.error('Error getting world storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })
    return {
      status: 500,
      body: {
        message: errorMessageOrDefault(error, 'Unknown error')
      }
    }
  }
}
