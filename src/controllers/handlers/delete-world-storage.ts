import { errorMessageOrDefault } from '../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../types'
import type { HTTPResponse } from '../../types/http'

export async function deleteWorldStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'worldStorage', '/storage/world/:key'>,
    'url' | 'components' | 'params'
  > &
    WorldStorageContext
): Promise<HTTPResponse> {
  const {
    params,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('delete-world-storage-handler')

  const key = params.key

  if (!worldName || !key) {
    return {
      status: 400,
      body: {
        message: 'World name and key are required'
      }
    }
  }

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
    return {
      status: 500,
      body: {
        message: errorMessageOrDefault(error, 'Unknown error')
      }
    }
  }
}
