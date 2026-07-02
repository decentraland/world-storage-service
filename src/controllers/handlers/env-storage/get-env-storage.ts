import { NotFoundError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { validateStorageKey } from '../commons/validateStorageKey'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function getEnvStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'envStorage', '/env/:key'>,
    'url' | 'components' | 'params' | 'worldName' | 'placeId'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    placeId,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('get-env-storage-handler')

  const key = params.key
  validateStorageKey(key)

  logger.debug('Processing get env storage request', {
    worldName,
    key
  })

  try {
    const value = await envStorage.getValue(worldName, placeId, key)

    // Strict null check: an empty string is a legitimately stored value (the upsert schema
    // accepts it), so a falsy check would 404 a key that exists and appears in the listing.
    if (value === null) {
      logger.info('Env variable not found', {
        worldName,
        key
      })
      throw new NotFoundError('Value not found')
    }

    logger.info('Env variable retrieved successfully', {
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

    logger.error('Error getting env variable', {
      worldName,
      key,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
