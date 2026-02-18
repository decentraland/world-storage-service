import { StorageLimitExceededError } from './errors'
import { calculateValueSizeInBytes } from '../../utils/calculateValueSizeInBytes'
import type { IStorageLimitsComponent, StorageNamespaceLimits } from './types'
import type { AppComponents } from '../../types'

/**
 * Creates a reusable upsert validation function for a given storage scope.
 *
 * This higher-order function encapsulates the common validation workflow:
 * 1. Checks value size against the per-value maximum
 * 2. Fetches size info (existing value size + total size) in a single DB query
 * 3. Checks projected total size against the per-scope maximum
 *
 * @param getSizeInfo - Returns the existing value's byte size and total scope size in one call
 * @param limits - The namespace limits to validate against
 * @returns An async function that validates a serialized value against the configured limits
 */
function createUpsertValidator(
  getSizeInfo: () => Promise<{ existingValueSize: number; totalSize: number }>,
  limits: StorageNamespaceLimits
): (serializedValue: string) => Promise<void> {
  return async (serializedValue: string): Promise<void> => {
    const newValueSize = calculateValueSizeInBytes(serializedValue)

    if (newValueSize > limits.maxValueSizeBytes) {
      throw new StorageLimitExceededError(
        `Value size (${newValueSize} bytes) exceeds the maximum allowed size (${limits.maxValueSizeBytes} bytes)`
      )
    }

    const { existingValueSize, totalSize: currentTotalSize } = await getSizeInfo()

    const projectedTotalSize = currentTotalSize - existingValueSize + newValueSize
    if (projectedTotalSize > limits.maxTotalSizeBytes) {
      throw new StorageLimitExceededError(
        `Total storage size would exceed the maximum allowed (${limits.maxTotalSizeBytes} bytes). Current usage: ${currentTotalSize} bytes. Delete existing data to free up space`
      )
    }
  }
}

/**
 * Creates the storage limits component that validates size limits
 * for all three storage namespaces.
 *
 * This component orchestrates validation by:
 * 1. Reading required limits from environment variables at startup
 * 2. Querying storage adapters for current usage via a single optimised query
 * 3. Validating the upsert operation against the configured limits
 *
 * @param components - Required components: config, logs, worldStorage, playerStorage, envStorage
 * @returns IStorageLimitsComponent implementation
 */
export async function createStorageLimitsComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'worldStorage' | 'playerStorage' | 'envStorage'>
): Promise<IStorageLimitsComponent> {
  const { config, logs, worldStorage, playerStorage, envStorage } = components
  const logger = logs.getLogger('storage-limits')

  const envLimits = {
    maxValueSizeBytes: await config.requireNumber('ENV_STORAGE_MAX_VALUE_SIZE_BYTES'),
    maxTotalSizeBytes: await config.requireNumber('ENV_STORAGE_MAX_TOTAL_SIZE_BYTES')
  }

  const worldLimits = {
    maxValueSizeBytes: await config.requireNumber('WORLD_STORAGE_MAX_VALUE_SIZE_BYTES'),
    maxTotalSizeBytes: await config.requireNumber('WORLD_STORAGE_MAX_TOTAL_SIZE_BYTES')
  }

  const playerLimits = {
    maxValueSizeBytes: await config.requireNumber('PLAYER_STORAGE_MAX_VALUE_SIZE_BYTES'),
    maxTotalSizeBytes: await config.requireNumber('PLAYER_STORAGE_MAX_TOTAL_SIZE_BYTES')
  }

  logger.info('Storage limits configured', {
    env: JSON.stringify(envLimits),
    world: JSON.stringify(worldLimits),
    player: JSON.stringify(playerLimits)
  })

  return {
    async validateWorldStorageUpsert(worldName: string, key: string, value: unknown): Promise<void> {
      const validate = createUpsertValidator(() => worldStorage.getUpsertSizeInfo(worldName, key), worldLimits)
      await validate(JSON.stringify(value))
    },

    async validatePlayerStorageUpsert(
      worldName: string,
      playerAddress: string,
      key: string,
      value: unknown
    ): Promise<void> {
      const validate = createUpsertValidator(
        () => playerStorage.getUpsertSizeInfo(worldName, playerAddress, key),
        playerLimits
      )
      await validate(JSON.stringify(value))
    },

    async validateEnvStorageUpsert(worldName: string, key: string, value: string): Promise<void> {
      const validate = createUpsertValidator(() => envStorage.getUpsertSizeInfo(worldName, key), envLimits)
      await validate(value)
    }
  }
}
