import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function deleteWorldStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'worldStorage', '/values/:key'>,
    'url' | 'components' | 'params' | 'worldName'
  >
): Promise<HTTPResponse> {
  const {
    params,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('delete-world-storage-handler')

  const key = params.key

  logger.debug('Processing delete world storage request', {
    worldName,
    key
  })

  try {
    await worldStorage.deleteValue(worldName, key)

    logger.info('World storage value deleted successfully', {
      worldName,
      key
    })

    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error deleting world storage value', {
      worldName,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
