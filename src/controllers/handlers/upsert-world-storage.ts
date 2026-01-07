import { errorMessageOrDefault } from '../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../types'
import type { HTTPResponse } from '../../types/http'

interface UpsertWorldStorageBody {
  value?: unknown
}

export async function upsertWorldStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'worldStorage', '/storage/world/:key'>,
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

  const key = params.key

  if (!worldName || !key) {
    throw new Error('World name and key are required')
  }

  let parsedBody: UpsertWorldStorageBody
  try {
    parsedBody = (await request.json()) as UpsertWorldStorageBody
  } catch {
    throw new Error('Request body must be valid JSON')
  }

  const value = parsedBody?.value

  if (value === undefined) {
    throw new Error('Value is required')
  }

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
    return {
      status: 500,
      body: {
        message: errorMessageOrDefault(error, 'Unknown error')
      }
    }
  }
}
