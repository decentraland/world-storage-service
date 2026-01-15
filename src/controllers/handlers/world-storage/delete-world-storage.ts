import { InvalidRequestError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

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

  if (!worldName) {
    throw new InvalidRequestError('World name is required')
  }

  const key = params.key

  logger.info('Deleting world storage value', {
    worldName,
    key
  })

  try {
    await worldStorage.deleteValue(worldName, key)
    return {
      status: 204
    }
  } catch (error) {
    logger.error('Error deleting world storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
