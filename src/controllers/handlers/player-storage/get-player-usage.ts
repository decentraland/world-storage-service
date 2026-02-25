import { InvalidRequestError } from '@dcl/http-commons'
import { EthAddress } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'
import type { HTTPStorageUsageResponse } from '../../../types/http'

export async function getPlayerUsageHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'playerStorage' | 'config', '/players/:player_address/usage'>,
    'components' | 'worldName' | 'params'
  >
): Promise<HTTPStorageUsageResponse> {
  const {
    params,
    worldName,
    components: { logs, playerStorage, config }
  } = context

  const logger = logs.getLogger('get-player-usage-handler')
  const playerAddress = params.player_address.toLowerCase()

  logger.debug('Processing player usage request', { worldName, playerAddress })

  if (!EthAddress.validate(playerAddress)) {
    throw new InvalidRequestError('Invalid player address')
  }

  try {
    const [{ totalSize: usedBytes }, maxTotalSizeBytes] = await Promise.all([
      playerStorage.getSizeInfo(worldName, playerAddress),
      config.requireNumber('PLAYER_STORAGE_MAX_TOTAL_SIZE_BYTES')
    ])

    logger.info('Player usage retrieved successfully', { worldName, playerAddress, usedBytes, maxTotalSizeBytes })

    return {
      status: 200,
      body: {
        usedBytes,
        maxTotalSizeBytes
      }
    }
  } catch (error) {
    logger.error('Error getting player usage', {
      worldName,
      playerAddress,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
