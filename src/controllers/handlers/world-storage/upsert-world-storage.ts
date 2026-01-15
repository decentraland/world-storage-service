import { InvalidRequestError } from '@dcl/platform-server-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertWorldStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'worldStorage', '/values/:key'>,
    'url' | 'components' | 'params' | 'request'
  > &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('upsert-world-storage-handler')

  if (!worldName) {
    throw new InvalidRequestError('World name is required')
  }

  const key = params.key

  const { value }: UpsertStorageBody = await request.json()

  logger.info('Upserting world storage value', {
    worldName,
    key
  })

  try {
    const item = await worldStorage.setValue(worldName, key, value)
    return {
      status: 200,
      body: {
        value: item.value
      }
    }
  } catch (error) {
    logger.error('Error upserting world storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
