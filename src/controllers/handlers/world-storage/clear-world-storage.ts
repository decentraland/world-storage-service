import { errorMessageOrDefault } from '../../../utils/errors'
import { validateConfirmDeleteAllHeader } from '../commons/confirmDeleteAll'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function clearWorldStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'worldStorage', '/values'>,
    'url' | 'components' | 'worldName' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    request,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('clear-world-storage-handler')

  validateConfirmDeleteAllHeader(request)

  logger.debug('Processing clear all world storage request', { worldName })

  try {
    await worldStorage.deleteAll(worldName)

    logger.info('All world storage values deleted successfully', { worldName })

    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error clearing all world storage values', {
      worldName,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
