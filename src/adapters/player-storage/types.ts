import type { StorageEntry } from '../../types/commons'
import type { PaginationOptions } from '../../types/http'

/**
 * Player storage component interface for managing player-level key-value storage within worlds
 */
export interface IPlayerStorageComponent {
  /**
   * Retrieves a single value from player storage as raw JSON text.
   *
   * The value is returned already serialized (via `value::text`) so it can be passed straight to
   * the HTTP response without a parse/re-stringify round-trip.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @returns The stored value as JSON text, or null if the key does not exist
   */
  getValue(worldName: string, placeId: string, playerAddress: string, key: string): Promise<string | null>

  /**
   * Creates or updates a value in player storage.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @param serializedValue - The value already serialized as JSON text (stored verbatim as jsonb)
   */
  setValue(
    worldName: string,
    placeId: string,
    playerAddress: string,
    key: string,
    serializedValue: string
  ): Promise<void>

  /**
   * Deletes a single value from player storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key to delete
   */
  deleteValue(worldName: string, placeId: string, playerAddress: string, key: string): Promise<void>

  /**
   * Deletes all values for a specific player within a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   */
  deleteAllForPlayer(worldName: string, placeId: string, playerAddress: string): Promise<void>

  /**
   * Deletes all player values for a scene (all players)
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   */
  deleteAll(worldName: string, placeId: string): Promise<void>

  /**
   * Lists storage items (key-value pairs) for a player with pagination
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param options - Pagination and filtering options
   * @returns Array of { key, value } entries sorted by key
   */
  listValues(
    worldName: string,
    placeId: string,
    playerAddress: string,
    options: PaginationOptions
  ): Promise<StorageEntry[]>

  /**
   * Counts the total number of keys for a player
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  countKeys(
    worldName: string,
    placeId: string,
    playerAddress: string,
    options: Pick<PaginationOptions, 'prefix'>
  ): Promise<number>

  /**
   * Lists distinct player addresses that have stored values in a scene with pagination
   *
   * Results are ordered alphabetically by player address (ASC) for deterministic pagination.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Pagination options (limit and offset)
   * @returns Array of player addresses sorted alphabetically
   */
  listPlayers(
    worldName: string,
    placeId: string,
    options: Pick<PaginationOptions, 'limit' | 'offset'>
  ): Promise<string[]>

  /**
   * Counts the total number of distinct players that have stored values in a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @returns Total count of distinct players
   */
  countPlayers(worldName: string, placeId: string): Promise<number>

  /**
   * Returns storage size info for a player scope in a world in a single query.
   *
   * When `key` is provided, this includes the existing value size for that key
   * plus total usage for the player's scope. Used by upsert limits validation.
   *
   * When `key` is omitted, `existingValueSize` is 0 and only total usage matters.
   * Used by usage endpoints.
   *
   * Size aggregation is always per-world (across all scenes).
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - Optional storage key
   * @returns Existing value size and total storage size
   */
  getSizeInfo(
    worldName: string,
    playerAddress: string,
    key?: string
  ): Promise<{ existingValueSize: number; totalSize: number }>
}
