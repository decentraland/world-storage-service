import { NotFoundError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPResponse } from '../../../types/http'

export async function getEnvStorageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'envStorage', '/env/:key'>,
    'url' | 'components' | 'params' | 'worldName'
  >
): Promise<HTTPResponse<unknown>> {
  const {
    params,
    worldName,
    components: { logs, envStorage }
  } = context

  const logger = logs.getLogger('get-env-storage-handler')

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
