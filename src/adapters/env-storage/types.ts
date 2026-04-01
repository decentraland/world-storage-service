import type { PaginationOptions } from '../../types/http'

/**
 * Env storage component interface for managing encrypted environment variables
 */
export interface IEnvStorageComponent {
  /**
   * Retrieves a single environment variable value
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The environment variable key
   * @returns The decrypted value or null if not found
   */
  getValue(worldName: string, placeId: string, key: string): Promise<string | null>

  /**
   * Creates or updates an environment variable
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The environment variable key
   * @param value - The value to encrypt and store
   */
  setValue(worldName: string, placeId: string, key: string, value: string): Promise<void>

  /**
   * Deletes a single environment variable
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The environment variable key to delete
   */
  deleteValue(worldName: string, placeId: string, key: string): Promise<void>

  /**
   * Deletes all environment variables for a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   */
  deleteAll(worldName: string, placeId: string): Promise<void>

  /**
   * Lists environment variable keys (names only, no values) for a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Pagination and filtering options
   * @returns Array of key names sorted alphabetically
   */
  listKeys(worldName: string, placeId: string, options: PaginationOptions): Promise<string[]>

  /**
   * Counts the total number of environment variable keys for a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  countKeys(worldName: string, placeId: string, options: Pick<PaginationOptions, 'prefix'>): Promise<number>

  /**
   * Returns storage size info for env variables in a world in a single query.
   *
   * When `key` is provided, this includes the existing value size for that key
   * plus total env usage for the world. Used by upsert limits validation.
   *
   * When `key` is omitted, `existingValueSize` is 0 and only total usage matters.
   * Used by usage endpoints.
   *
   * Size aggregation is always per-world (across all scenes).
   *
   * @param worldName - The world identifier
   * @param key - Optional environment variable key
   * @returns Existing value size and total storage size
   */
  getSizeInfo(worldName: string, key?: string): Promise<{ existingValueSize: number; totalSize: number }>
}
