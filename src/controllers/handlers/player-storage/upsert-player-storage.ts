import { InvalidRequestError } from '@dcl/platform-server-commons'
import { EthAddress } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../types'
import type { HTTPResponse } from '../../../types/http'
import type { UpsertStorageBody } from '../schemas'

export async function upsertPlayerStorageHandler(
  context: Pick<
    HandlerContextWithPath<'logs' | 'playerStorage', '/players/:player_address/values/:key'>,
    'url' | 'components' | 'params' | 'request'
  > &
    WorldStorageContext
): Promise<HTTPResponse<unknown>> {
  const {
    request,
    params,
    worldName,
    components: { logs, playerStorage }
  } = context

  const logger = logs.getLogger('upsert-player-storage-handler')

  const playerAddress = params.player_address.toLowerCase()
  const key = params.key

  if (!EthAddress.validate(playerAddress)) {
    throw new InvalidRequestError('Invalid player address')
  }

  if (!worldName || !playerAddress) {
    throw new InvalidRequestError('World name and player address are required')
  }

  const { value }: UpsertStorageBody = await request.json()

  logger.info('Upserting player storage value', {
    worldName,
    playerAddress,
    key
  })

  try {
    const item = await playerStorage.setValue(worldName, playerAddress, key, value)
    return {
      status: 200,
      body: {
        value: item.value
      }
    }
  } catch (error) {
    logger.error('Error upserting player storage value', {
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
