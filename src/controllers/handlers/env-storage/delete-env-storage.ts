import { InvalidRequestError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

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

  if (!worldName) {
    throw new InvalidRequestError('World name is required')
  }

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
