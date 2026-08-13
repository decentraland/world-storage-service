import { InvalidValueError, StorageLimitExceededError } from './errors'
import { calculateValueSizeInBytes } from '../../utils/calculateValueSizeInBytes'
import type { IStorageLimitsComponent, StorageNamespaceLimits } from './types'
import type { AppComponents } from '../../types'

/**
 * Matches a `\u0000` escape that encodes an actual NUL character: one not preceded by a
 * backslash (an even number of backslashes before `\u0000` means the backslash itself is
 * escaped text, e.g. the literal string `\\u0000`, which is fine). Postgres `jsonb` cannot
 * store NUL characters and rejects such values with an internal error, so they are turned
 * away here with a 400 instead.
 */
const NUL_ESCAPE_PATTERN = /(?<!\\)(?:\\\\)*\\u0000/

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
 * Rejects JSON values that contain NUL characters, which Postgres `jsonb` cannot store.
 * Checked on the serialized text (where `JSON.stringify` always encodes NUL as `\u0000`)
 * so no extra traversal of the value is needed.
 *
 * @param serializedValue - The value serialized as JSON text
 * @throws {InvalidValueError} If the value contains a NUL character
 */
function rejectNulCharacters(serializedValue: string): void {
  if (NUL_ESCAPE_PATTERN.test(serializedValue)) {
    throw new InvalidValueError('Values must not contain the \\u0000 (NUL) character')
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
 * The quota scope of the size query is decided by the adapters: totals are per-world for
 * `*.eth` worlds and per-place for shared Genesis City realms, and the existing-value
 * credit is always resolved against the exact `(place_id, key)` row being replaced.
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
    limits: {
      env: envLimits,
      world: worldLimits,
      player: playerLimits
    },

    async validateWorldStorageUpsert(worldName: string, placeId: string, key: string, value: unknown): Promise<string> {
      // Serialize once here and hand the string back to the caller so the storage write reuses it
      // instead of serializing the same value a second time.
      const serializedValue = JSON.stringify(value)
      rejectNulCharacters(serializedValue)
      const validate = createUpsertValidator(() => worldStorage.getSizeInfo(worldName, placeId, key), worldLimits)
      await validate(serializedValue)
      return serializedValue
    },

    async validatePlayerStorageUpsert(
      worldName: string,
      placeId: string,
      playerAddress: string,
      key: string,
      value: unknown
    ): Promise<string> {
      // Serialize once here and hand the string back to the caller so the storage write reuses it
      // instead of serializing the same value a second time.
      const serializedValue = JSON.stringify(value)
      rejectNulCharacters(serializedValue)
      const validate = createUpsertValidator(
        () => playerStorage.getSizeInfo(worldName, placeId, playerAddress, key),
        playerLimits
      )
      await validate(serializedValue)
      return serializedValue
    },

    async validateEnvStorageUpsert(worldName: string, placeId: string, key: string, value: string): Promise<void> {
      // No `rejectNulCharacters` here, unlike the world/player validators: env values are stored
      // encrypted in a `bytea` column (never as jsonb), so the Postgres NUL restriction does not
      // apply. If content validation that throws `InvalidValueError` is ever added here, also catch
      // it in `upsertEnvStorageHandler` (which today only maps `StorageLimitExceededError`).
      const validate = createUpsertValidator(() => envStorage.getSizeInfo(worldName, placeId, key), envLimits)
      await validate(value)
    }
  }
}
