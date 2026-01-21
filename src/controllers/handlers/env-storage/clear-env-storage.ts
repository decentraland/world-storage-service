import { errorMessageOrDefault } from '../../../utils/errors'
import { validateConfirmDeleteAllHeader } from '../commons/confirmDeleteAll'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function clearEnvStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'envStorage', '/env'>,
    'url' | 'components' | 'worldName' | 'request'
  >
): Promise<HTTPResponse> {
  const {
    request,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('clear-env-storage-handler')

  validateConfirmDeleteAllHeader(request)

  logger.debug('Processing clear all env storage request', { worldName })

  try {
    await envStorage.deleteAll(worldName)

    logger.info('All env variables deleted successfully', { worldName })

    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error clearing all env variables', {
      worldName,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
