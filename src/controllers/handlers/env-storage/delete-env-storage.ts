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

  logger.info('Deleting env storage value', {
    worldName,
    key
  })

  try {
    await envStorage.deleteValue(worldName, key)
    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error deleting env storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
