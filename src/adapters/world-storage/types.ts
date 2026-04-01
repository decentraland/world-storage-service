import type { StorageEntry } from '../../types/commons'
import type { PaginationOptions } from '../../types/http'

export interface WorldStorageItem {
  worldName: string
  key: string
  value: unknown
}

/**
 * World storage component interface for managing world-level key-value storage
 */
export interface IWorldStorageComponent {
  /**
   * Retrieves a single value from world storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  getValue(worldName: string, placeId: string, key: string): Promise<unknown | null>

  /**
   * Creates or updates a value in world storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key
   * @param value - The value to store
   * @returns The stored item
   */
  setValue(worldName: string, placeId: string, key: string, value: unknown): Promise<WorldStorageItem>

  /**
   * Deletes a single value from world storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key to delete
   */
  deleteValue(worldName: string, placeId: string, key: string): Promise<void>

  /**
   * Deletes all values for a scene within a world
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   */
  deleteAll(worldName: string, placeId: string): Promise<void>

  /**
   * Lists storage items (key-value pairs) for a scene with pagination
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Pagination and filtering options
   * @returns Array of { key, value } entries sorted by key
   */
  listValues(worldName: string, placeId: string, options: PaginationOptions): Promise<StorageEntry[]>

  /**
   * Counts the total number of keys for a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  countKeys(worldName: string, placeId: string, options: Pick<PaginationOptions, 'prefix'>): Promise<number>

  /**
   * Returns storage size info for a world in a single database query.
   *
   * When `key` is provided, this includes the existing value size for that key
   * plus the total storage size for the world. Used by upsert limits validation.
   *
   * When `key` is omitted, `existingValueSize` is always 0 and only total usage
   * is relevant. Used by usage endpoints.
   *
   * Size aggregation is always per-world (across all scenes).
   *
   * @param worldName - The world identifier
   * @param key - Optional storage key
   * @returns Existing value size and total storage size
   */
  getSizeInfo(worldName: string, key?: string): Promise<{ existingValueSize: number; totalSize: number }>
}
