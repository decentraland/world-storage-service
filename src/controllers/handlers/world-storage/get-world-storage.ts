import { NotFoundError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function getWorldStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'worldStorage', '/values/:key'>,
    'url' | 'components' | 'params' | 'worldName'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('get-world-storage-handler')

  const key = params.key

  logger.debug('Processing get world storage request', {
    worldName,
    key
  })

  try {
    const value = await worldStorage.getValue(worldName, key)

    if (!value) {
      logger.info('World storage value not found', {
        worldName,
        key
      })
      throw new NotFoundError('Value not found')
    }

    logger.info('World storage value retrieved successfully', {
      worldName,
      key
    })

    return {
      status: 200,
      body: {
        value
      }
    }
  } catch (error) {
    // Only log as error if it's not a NotFoundError (which is expected behavior)
    if (error instanceof NotFoundError) {
      throw error
    }

    logger.error('Error getting world storage value', {
      worldName,
      key,
      error: errorMessageOrDefault(error)
    })

    throw error
  }
}
