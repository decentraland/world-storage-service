import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPStorageUsageResponse } from '../../../types/http'

export async function getEnvUsageHandler(
  context: Pick<WorldHandlerContextWithPath<'logs' | 'envStorage' | 'config', '/env/usage'>, 'components' | 'worldName'>
): Promise<HTTPStorageUsageResponse> {
  const {
    worldName,
    components: { logs, envStorage, config }
  } = context

  const logger = logs.getLogger('get-env-usage-handler')

  logger.debug('Processing env usage request', { worldName })

  try {
    const [{ totalSize: usedBytes }, maxTotalSizeBytes] = await Promise.all([
      envStorage.getSizeInfo(worldName),
      config.requireNumber('ENV_STORAGE_MAX_TOTAL_SIZE_BYTES')
    ])

    logger.info('Env usage retrieved successfully', { worldName, usedBytes, maxTotalSizeBytes })

    return {
      status: 200,
      body: {
        usedBytes,
        maxTotalSizeBytes
      }
    }
  } catch (error) {
    logger.error('Error getting env usage', {
      worldName,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
