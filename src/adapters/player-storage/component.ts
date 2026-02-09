import { SQL } from 'sql-template-strings'
import { buildPrefixPattern } from '../../utils/prefix'
import type { IPlayerStorageComponent, PlayerStorageItem } from './types'
import type { AppComponents } from '../../types'
import type { StorageEntry } from '../../types/commons'
import type { PaginationOptions } from '../../types/http'
import type { SQLStatement } from 'sql-template-strings'

/**
 * Creates the player storage component that manages player-level key-value storage within worlds.
 *
 * @param components - Required components: pg (database), logs (logger)
 * @returns IPlayerStorageComponent implementation
 */
export const createPlayerStorageComponent = ({
  pg,
  logs
}: Pick<AppComponents, 'pg' | 'logs'>): IPlayerStorageComponent => {
  const logger = logs.getLogger('player-storage')

  /**
   * Retrieves a single value from player storage
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  async function getValue(worldName: string, playerAddress: string, key: string): Promise<unknown | null> {
    logger.debug('Fetching player storage value', { worldName, playerAddress, key })

    const query = SQL`SELECT value FROM player_storage WHERE world_name = ${worldName} AND player_address = ${playerAddress} AND key = ${key}`
    const result = await pg.query<Pick<PlayerStorageItem, 'value'>>(query)
    const value = result.rows[0]?.value ?? null

    logger.debug(value === null ? 'Player storage value not found' : 'Player storage value retrieved successfully', {
      worldName,
      playerAddress,
      key
    })

    return value
  }

  /**
   * Creates or updates a value in player storage
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @param value - The value to store
   * @returns The stored item
   */
  async function setValue(
    worldName: string,
    playerAddress: string,
    key: string,
    value: unknown
  ): Promise<PlayerStorageItem> {
    logger.debug('Setting player storage value', { worldName, playerAddress, key })

    const now = new Date().toISOString()
    const jsonValue = JSON.stringify(value)
    const query = SQL`
      INSERT INTO player_storage (world_name, player_address, key, value, created_at, updated_at)
      VALUES (${worldName}, ${playerAddress}, ${key}, ${jsonValue}::jsonb, ${now}, ${now})
      ON CONFLICT (world_name, player_address, key) DO
      UPDATE
      SET value = ${jsonValue}::jsonb, updated_at = ${now}
      RETURNING world_name as "worldName", player_address as "playerAddress", key, value`
    const result = await pg.query<PlayerStorageItem>(query)

    logger.debug('Player storage value set successfully', { worldName, playerAddress, key })

    return result.rows[0]
  }

  /**
   * Deletes a single value from player storage
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - The storage key to delete
   */
  async function deleteValue(worldName: string, playerAddress: string, key: string): Promise<void> {
    logger.debug('Deleting player storage value', { worldName, playerAddress, key })

    const query = SQL`DELETE FROM player_storage WHERE world_name = ${worldName} AND player_address = ${playerAddress} AND key = ${key}`
    await pg.query(query)

    logger.debug('Player storage value deleted successfully', { worldName, playerAddress, key })
  }

  /**
   * Deletes all values for a specific player within a world
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   */
  async function deleteAllForPlayer(worldName: string, playerAddress: string): Promise<void> {
    logger.debug('Deleting all player storage values for player', { worldName, playerAddress })

    const query = SQL`DELETE FROM player_storage WHERE world_name = ${worldName} AND player_address = ${playerAddress}`
    await pg.query(query)

    logger.debug('All player storage values deleted successfully for player', { worldName, playerAddress })
  }

  /**
   * Deletes all player values for a world (all players)
   *
   * @param worldName - The world identifier
   */
  async function deleteAll(worldName: string): Promise<void> {
    logger.debug('Deleting all player storage values', { worldName })

    const query = SQL`DELETE FROM player_storage WHERE world_name = ${worldName}`
    await pg.query(query)

    logger.debug('All player storage values deleted successfully', { worldName })
  }

  /**
   * Lists storage items (key-value pairs) for a player with pagination
   *
   * Results are ordered alphabetically by key (ASC) for deterministic pagination.
   * Each item is returned as { key, value }.
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param options - Pagination and filtering options
   * @returns Array of { key, value } entries sorted by key
   */
  async function listValues(
    worldName: string,
    playerAddress: string,
    options: PaginationOptions
  ): Promise<StorageEntry[]> {
    const { limit, offset, prefix } = options

    logger.debug('Listing player storage values', { worldName, playerAddress, limit, offset, prefix: prefix ?? 'none' })

    const query = SQL`SELECT key, value`.append(buildValuesBaseQuery(worldName, playerAddress, prefix)).append(SQL`
      ORDER BY key ASC
      LIMIT ${limit} OFFSET ${offset}`)

    const result = await pg.query<StorageEntry>(query)

    logger.debug('Player storage values listed successfully', { worldName, playerAddress, count: result.rows.length })

    return result.rows
  }

  /**
   * Counts the total number of keys for a player
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  async function countKeys(
    worldName: string,
    playerAddress: string,
    options: Pick<PaginationOptions, 'prefix'>
  ): Promise<number> {
    const { prefix } = options

    logger.debug('Counting player storage keys', { worldName, playerAddress, prefix: prefix ?? 'none' })

    const query = SQL`SELECT COUNT(*)::int as count`.append(buildValuesBaseQuery(worldName, playerAddress, prefix))

    const result = await pg.query<{ count: number }>(query)
    const count = result.rows[0]?.count ?? 0

    logger.debug('Player storage keys counted successfully', { worldName, playerAddress, count })

    return count
  }

  /**
   * Builds the shared FROM + WHERE clause for player_storage queries.
   *
   * Both listValues and countKeys filter on the same criteria (world_name + player_address + optional prefix).
   * This helper centralises that logic so it is defined once.
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param prefix - Optional key prefix filter
   * @returns A SQLStatement containing the FROM and WHERE clauses
   */
  function buildValuesBaseQuery(worldName: string, playerAddress: string, prefix?: string): SQLStatement {
    const prefixPattern = buildPrefixPattern(prefix)
    return SQL`
      FROM player_storage
      WHERE world_name = ${worldName} AND player_address = ${playerAddress}
        AND (${prefixPattern}::text IS NULL OR key LIKE ${prefixPattern})`
  }

  return {
    getValue,
    setValue,
    deleteValue,
    deleteAllForPlayer,
    deleteAll,
    listValues,
    countKeys
  }
}
