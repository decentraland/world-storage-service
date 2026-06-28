import type { PaginationOptions } from '../../types/http'

/**
 * World storage component interface for managing world-level key-value storage
 */
export interface IWorldStorageComponent {
  /**
   * Retrieves a single value from world storage as raw JSON text.
   *
   * The value is returned already serialized (via `value::text`) so it can be passed straight to
   * the HTTP response without a parse/re-stringify round-trip.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key
   * @returns The stored value as JSON text, or null if the key does not exist
   */
  getValue(worldName: string, placeId: string, key: string): Promise<string | null>

  /**
   * Creates or updates a value in world storage.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key
   * @param serializedValue - The value already serialized as JSON text (stored verbatim as jsonb)
   */
  setValue(worldName: string, placeId: string, key: string, serializedValue: string): Promise<void>

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
   * Lists storage items (key-value pairs) for a scene with pagination.
   *
   * Returns the page already serialized as a JSON array text (values are read as `value::text` and
   * spliced in verbatim) so it can be passed straight to the HTTP response without a per-row
   * parse/re-stringify round-trip.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Pagination and filtering options
   * @returns The page as JSON array text of { key, value } entries sorted by key
   */
  listValues(worldName: string, placeId: string, options: PaginationOptions): Promise<string>

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
