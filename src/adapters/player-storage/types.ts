import type { StorageEntry } from '../../types/commons'
import type { PaginationOptions } from '../../types/http'

export interface PlayerStorageItem {
  worldName: string
  playerAddress: string
  key: string
  value: unknown
}

/**
 * Player storage component interface for managing player-level key-value storage within worlds
 */
export interface IPlayerStorageComponent {
  /**
   * Retrieves a single value from player storage
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  getValue(worldName: string, playerAddress: string, key: string): Promise<unknown | null>

  /**
   * Creates or updates a value in player storage
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @param value - The value to store
   * @returns The stored item
   */
  setValue(worldName: string, playerAddress: string, key: string, value: unknown): Promise<PlayerStorageItem>

  /**
   * Deletes a single value from player storage
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - The storage key to delete
   */
  deleteValue(worldName: string, playerAddress: string, key: string): Promise<void>

  /**
   * Deletes all values for a specific player within a world
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   */
  deleteAllForPlayer(worldName: string, playerAddress: string): Promise<void>

  /**
   * Deletes all player values for a world (all players)
   *
   * @param worldName - The world identifier
   */
  deleteAll(worldName: string): Promise<void>

  /**
   * Lists storage items (key-value pairs) for a player with pagination
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param options - Pagination and filtering options
   * @returns Array of { key, value } entries sorted by key
   */
  listValues(worldName: string, playerAddress: string, options: PaginationOptions): Promise<StorageEntry[]>

  /**
   * Counts the total number of keys for a player
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  countKeys(worldName: string, playerAddress: string, options: Pick<PaginationOptions, 'prefix'>): Promise<number>

  /**
   * Lists distinct player addresses that have stored values in a world with pagination
   *
   * Results are ordered alphabetically by player address (ASC) for deterministic pagination.
   *
   * @param worldName - The world identifier
   * @param options - Pagination options (limit and offset)
   * @returns Array of player addresses sorted alphabetically
   */
  listPlayers(worldName: string, options: Pick<PaginationOptions, 'limit' | 'offset'>): Promise<string[]>

  /**
   * Counts the total number of distinct players that have stored values in a world
   *
   * @param worldName - The world identifier
   * @returns Total count of distinct players
   */
  countPlayers(worldName: string): Promise<number>

  /**
   * Returns the existing value's byte size and the total storage size for a player in a world
   * in a single database query. Used by the storage limits validator to efficiently
   * compute projected total size without fetching/deserializing the full value.
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - The storage key being upserted
   * @returns The existing value's byte size (0 if key does not exist) and the total storage size
   */
  getUpsertSizeInfo(
    worldName: string,
    playerAddress: string,
    key: string
  ): Promise<{ existingValueSize: number; totalSize: number }>
}
