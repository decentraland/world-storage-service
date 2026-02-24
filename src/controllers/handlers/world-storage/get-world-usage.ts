import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPStorageUsageResponse } from '../../../types/http'

export async function getWorldUsageHandler(
  context: Pick<WorldHandlerContextWithPath<'logs' | 'worldStorage' | 'config', '/usage'>, 'components' | 'worldName'>
): Promise<HTTPStorageUsageResponse> {
  const {
    worldName,
    components: { logs, worldStorage, config }
  } = context

  const logger = logs.getLogger('get-world-usage-handler')

  logger.debug('Processing world usage request', { worldName })

  try {
    const [{ totalSize: usedBytes }, maxTotalSizeBytes] = await Promise.all([
      worldStorage.getSizeInfo(worldName),
      config.requireNumber('WORLD_STORAGE_MAX_TOTAL_SIZE_BYTES')
    ])

    logger.info('World usage retrieved successfully', { worldName, usedBytes, maxTotalSizeBytes })

    return {
      status: 200,
      body: {
        usedBytes,
        maxTotalSizeBytes
      }
    }
  } catch (error) {
    logger.error('Error getting world usage', {
      worldName,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
