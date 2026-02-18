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
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  getValue(worldName: string, key: string): Promise<unknown | null>

  /**
   * Creates or updates a value in world storage
   *
   * @param worldName - The world identifier
   * @param key - The storage key
   * @param value - The value to store
   * @returns The stored item
   */
  setValue(worldName: string, key: string, value: unknown): Promise<WorldStorageItem>

  /**
   * Deletes a single value from world storage
   *
   * @param worldName - The world identifier
   * @param key - The storage key to delete
   */
  deleteValue(worldName: string, key: string): Promise<void>

  /**
   * Deletes all values for a world
   *
   * @param worldName - The world identifier
   */
  deleteAll(worldName: string): Promise<void>

  /**
   * Lists storage items (key-value pairs) for a world with pagination
   *
   * @param worldName - The world identifier
   * @param options - Pagination and filtering options
   * @returns Array of { key, value } entries sorted by key
   */
  listValues(worldName: string, options: PaginationOptions): Promise<StorageEntry[]>

  /**
   * Counts the total number of keys for a world
   *
   * @param worldName - The world identifier
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  countKeys(worldName: string, options: Pick<PaginationOptions, 'prefix'>): Promise<number>

  /**
   * Returns the existing value's byte size and the total storage size for a world
   * in a single database query. Used by the storage limits validator to efficiently
   * compute projected total size without fetching/deserializing the full value.
   *
   * @param worldName - The world identifier
   * @param key - The storage key being upserted
   * @returns The existing value's byte size (0 if key does not exist) and the total storage size
   */
  getUpsertSizeInfo(worldName: string, key: string): Promise<{ existingValueSize: number; totalSize: number }>
}
