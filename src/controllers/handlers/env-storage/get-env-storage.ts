import { InvalidRequestError, NotFoundError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function getEnvStorageHandler(
  context: Pick<HandlerContextWithPath<'logs' | 'envStorage', '/env/:key'>, 'url' | 'components' | 'params'> &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('get-env-storage-handler')

  if (!worldName) {
    throw new InvalidRequestError('World name is required')
  }

  const key = params.key

  logger.info('Getting env storage value', {
    worldName,
    key
  })

  try {
    const value = await envStorage.getValue(worldName, key)

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
    logger.error('Error getting env storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
