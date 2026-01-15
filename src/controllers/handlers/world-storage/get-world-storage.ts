import { InvalidRequestError, NotFoundError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function getWorldStorageHandler(
  context: Pick<HandlerContextWithPath<'logs' | 'worldStorage', '/values/:key'>, 'url' | 'components' | 'params'> &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('get-world-storage-handler')

  if (!worldName) {
    throw new InvalidRequestError('World name is required')
  }

  const key = params.key

  logger.info('Getting world storage value', {
    worldName,
    key
  })

  try {
    const value = await worldStorage.getValue(worldName, key)

    if (!value) {
      throw new NotFoundError('Value not found')
    }

    return {
      status: 200,
      body: {
        value
      }
    }
  } catch (error) {
    logger.error('Error getting world storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
