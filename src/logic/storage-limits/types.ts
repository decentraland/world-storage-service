/**
 * Size limits configuration for a single storage namespace
 */
export interface StorageNamespaceLimits {
  /** Maximum size of a single value in bytes */
  maxValueSizeBytes: number
  /** Maximum total storage size in bytes per scope */
  maxTotalSizeBytes: number
}

/**
 * Storage limits component interface that validates size limits
 * for all three storage namespaces (env, world, player).
 *
 * Encapsulates the full validation orchestration: checking value size
 * and total storage size against configurable limits.
 * Limits are read from environment variables at startup time.
 */
export interface IStorageLimitsComponent {
  /**
   * Validates that a world storage upsert operation is within configured limits.
   *
   * Checks are performed in order:
   * 1. Value size does not exceed the per-value maximum
   * 2. Total storage size would not exceed the per-world maximum
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key being upserted
   * @param value - The value to store
   * @returns The value serialized as JSON text (computed once here so the caller can reuse it)
   * @throws {InvalidRequestError} If any limit is exceeded
   */
  validateWorldStorageUpsert(worldName: string, placeId: string, key: string, value: unknown): Promise<string>

  /**
   * Validates that a player storage upsert operation is within configured limits.
   *
   * Checks are performed in order:
   * 1. Value size does not exceed the per-value maximum
   * 2. Total storage size would not exceed the per-player-per-world maximum
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key being upserted
   * @param value - The value to store
   * @returns The value serialized as JSON text (computed once here so the caller can reuse it)
   * @throws {InvalidRequestError} If any limit is exceeded
   */
  validatePlayerStorageUpsert(
    worldName: string,
    placeId: string,
    playerAddress: string,
    key: string,
    value: unknown
  ): Promise<string>

  /**
   * Validates that an env storage upsert operation is within configured limits.
   *
   * Checks are performed in order:
   * 1. Value size does not exceed the per-value maximum
   * 2. Total storage size would not exceed the per-world maximum
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The environment variable key being upserted
   * @param value - The string value to store
   * @throws {InvalidRequestError} If any limit is exceeded
   */
  validateEnvStorageUpsert(worldName: string, placeId: string, key: string, value: string): Promise<void>
}
