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
    if (!worldName) {
      throw new InvalidRequestError('World name is required')
    }

    const key = params.key

    if (!key) {
      throw new InvalidRequestError('Key is required')
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

    const errorMessage = errorMessageOrDefault(error, 'Unknown error')

    logger.error('Error getting world storage value', {
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
