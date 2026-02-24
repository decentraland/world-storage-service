import type { PaginationOptions } from '../../types/http'

/**
 * Env storage component interface for managing encrypted environment variables
 */
export interface IEnvStorageComponent {
  /**
   * Retrieves a single environment variable value
   *
   * @param worldName - The world identifier
   * @param key - The environment variable key
   * @returns The decrypted value or null if not found
   */
  getValue(worldName: string, key: string): Promise<string | null>

  /**
   * Creates or updates an environment variable
   *
   * @param worldName - The world identifier
   * @param key - The environment variable key
   * @param value - The value to encrypt and store
   */
  setValue(worldName: string, key: string, value: string): Promise<void>

  /**
   * Deletes a single environment variable
   *
   * @param worldName - The world identifier
   * @param key - The environment variable key to delete
   */
  deleteValue(worldName: string, key: string): Promise<void>

  /**
   * Deletes all environment variables for a world
   *
   * @param worldName - The world identifier
   */
  deleteAll(worldName: string): Promise<void>

  /**
   * Lists environment variable keys (names only, no values) for a world
   *
   * @param worldName - The world identifier
   * @param options - Pagination and filtering options
   * @returns Array of key names sorted alphabetically
   */
  listKeys(worldName: string, options: PaginationOptions): Promise<string[]>

  /**
   * Counts the total number of environment variable keys for a world
   *
   * @param worldName - The world identifier
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  countKeys(worldName: string, options: Pick<PaginationOptions, 'prefix'>): Promise<number>

  /**
   * Returns storage size info for env variables in a world in a single query.
   *
   * When `key` is provided, this includes the existing value size for that key
   * plus total env usage for the world. Used by upsert limits validation.
   *
   * When `key` is omitted, `existingValueSize` is 0 and only total usage matters.
   * Used by usage endpoints.
   *
   * @param worldName - The world identifier
   * @param key - Optional environment variable key
   * @returns Existing value size and total storage size
   */
  getSizeInfo(worldName: string, key?: string): Promise<{ existingValueSize: number; totalSize: number }>
}
