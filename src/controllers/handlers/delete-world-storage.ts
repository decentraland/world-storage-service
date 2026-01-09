import { InvalidRequestError, errorMessageOrDefault, isInvalidRequestError } from '../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../types'
import type { HTTPResponse } from '../../types/http'

export async function deleteWorldStorageHandler(
  context: Pick<HandlerContextWithPath<'logs' | 'worldStorage', '/values/:key'>, 'url' | 'components' | 'params'> &
    WorldStorageContext
): Promise<HTTPResponse> {
  const {
    params,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('delete-world-storage-handler')

  try {
    const key = params.key

    if (!key) {
      throw new InvalidRequestError('Key is required')
    }

    logger.info('Deleting world storage value', {
      worldName: worldName!,
      key
    })

    await worldStorage.deleteValue(worldName!, key)
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

    logger.error('Error deleting world storage value', {
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
