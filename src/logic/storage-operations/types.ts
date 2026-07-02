/**
 * Storage operations component interface.
 *
 * Orchestrates quota-guarded storage writes: each upsert runs the limits validation and
 * the write inside a single database transaction that holds an advisory lock on the quota
 * scope, so concurrent upserts cannot exceed the configured limits by validating against
 * the same usage snapshot.
 */
export interface IStorageOperationsComponent {
  /**
   * Validates and writes a world storage value atomically.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key
   * @param value - The value to store
   * @returns The value serialized as JSON text (serialized once, reusable for the response)
   * @throws {StorageLimitExceededError} If a storage limit would be exceeded
   * @throws {InvalidRequestError} If the value cannot be stored (e.g. contains NUL characters)
   */
  upsertWorldValue(worldName: string, placeId: string, key: string, value: unknown): Promise<string>

  /**
   * Validates and writes a player storage value atomically.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address (lowercased)
   * @param key - The storage key
   * @param value - The value to store
   * @returns The value serialized as JSON text (serialized once, reusable for the response)
   * @throws {StorageLimitExceededError} If a storage limit would be exceeded
   * @throws {InvalidRequestError} If the value cannot be stored (e.g. contains NUL characters)
   */
  upsertPlayerValue(
    worldName: string,
    placeId: string,
    playerAddress: string,
    key: string,
    value: unknown
  ): Promise<string>

  /**
   * Validates, encrypts, and writes an environment variable atomically.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The environment variable key
   * @param value - The plaintext value to encrypt and store
   * @throws {StorageLimitExceededError} If a storage limit would be exceeded
   */
  upsertEnvValue(worldName: string, placeId: string, key: string, value: string): Promise<void>
}
