import { NotFoundError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { rawJsonValueResponse } from '../../../utils/rawJsonResponse'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { RawJSONResponse } from '../../../types/http'

export async function getWorldStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'worldStorage', '/values/:key'>,
    'url' | 'components' | 'params' | 'worldName' | 'placeId'
  >
): Promise<RawJSONResponse> {
  const {
    params,
    worldName,
    placeId,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('get-world-storage-handler')

  const key = params.key

  logger.debug('Processing get world storage request', {
    worldName,
    key
  })

  try {
    // `value` is the stored value as raw JSON text, or null when the key does not exist.
    const value = await worldStorage.getValue(worldName, placeId, key)

    if (value === null) {
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

    return rawJsonValueResponse(value)
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
