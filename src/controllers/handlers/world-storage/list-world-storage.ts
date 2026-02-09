import { InvalidRequestError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parseSearchParams } from '../commons/parseSearchParams'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { StorageEntry } from '../../../types/commons'
import type { HTTPPaginatedResponse } from '../../../types/http'

/**
 * Handler for listing world storage values with pagination
 *
 * Results are paginated and ordered alphabetically by key (ASC) for deterministic pagination.
 * Each item is returned as { key, value }.
 *
 * @param context - Request context with worldName, components, and URL
 * @returns Paginated list of { key, value } entries
 */
export async function listWorldStorageHandler(
  context: Pick<WorldHandlerContextWithPath<'logs' | 'worldStorage', '/values'>, 'url' | 'components' | 'worldName'>
): Promise<HTTPPaginatedResponse<StorageEntry[]>> {
  const {
    url,
    worldName,
    components: { logs, worldStorage }
  } = context

  const logger = logs.getLogger('list-world-storage-handler')

  logger.debug('Processing list world storage request', { worldName })

  try {
    const { limit, offset, prefix } = parseSearchParams(url)

    logger.debug('Parsed pagination params', { worldName, limit, offset, prefix: prefix ?? 'none' })

    // Fetch values and total count in parallel
    const [values, total] = await Promise.all([
      worldStorage.listValues(worldName, { limit, offset, prefix }),
      worldStorage.countKeys(worldName, { prefix })
    ])

    logger.info('World storage values listed successfully', {
      worldName,
      count: values.length,
      total,
      limit,
      offset
    })

    return {
      status: 200,
      body: {
        data: values,
        pagination: { limit, offset, total }
      }
    }
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      throw error
    }

    logger.error('Error listing world storage values', {
      worldName,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
