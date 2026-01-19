import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function deleteEnvStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'envStorage', '/env/:key'>,
    'url' | 'components' | 'params' | 'worldName'
  >
): Promise<HTTPResponse> {
  const {
    params,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('delete-env-storage-handler')

  const key = params.key

  logger.debug('Processing delete env storage request', {
    worldName,
    key
  })

  try {
    await envStorage.deleteValue(worldName, key)

    logger.info('Env variable deleted successfully', {
      worldName,
      key
    })

    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error deleting env variable', {
      worldName,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
