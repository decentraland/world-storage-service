import { SQL } from 'sql-template-strings'
import { calculateValueSizeInBytes } from '../../utils/calculateValueSizeInBytes'
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
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  async function getValue(
    worldName: string,
    placeId: string,
    playerAddress: string,
    key: string
  ): Promise<unknown | null> {
    logger.debug('Fetching player storage value', { worldName, placeId, playerAddress, key })

    const query = SQL`SELECT value FROM player_storage WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND player_address = ${playerAddress} AND key = ${key}`
    const result = await pg.query<Pick<PlayerStorageItem, 'value'>>(query)
    const value = result.rows[0]?.value ?? null

    logger.debug(value === null ? 'Player storage value not found' : 'Player storage value retrieved successfully', {
      worldName,
      placeId,
      playerAddress,
      key
    })

    return value
  }

  /**
   * Creates or updates a value in player storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @param value - The value to store
   * @returns The stored item
   */
  async function setValue(
    worldName: string,
    placeId: string,
    playerAddress: string,
    key: string,
    value: unknown
  ): Promise<PlayerStorageItem> {
    logger.debug('Setting player storage value', { worldName, placeId, playerAddress, key })

    const now = new Date().toISOString()
    const jsonValue = JSON.stringify(value)
    const valueSize = calculateValueSizeInBytes(jsonValue)
    const query = SQL`
      INSERT INTO player_storage (world_name, place_id, player_address, key, value, value_size, created_at, updated_at)
      VALUES (${worldName}, ${placeId}::uuid, ${playerAddress}, ${key}, ${jsonValue}::jsonb, ${valueSize}, ${now}, ${now})
      ON CONFLICT (world_name, place_id, player_address, key) DO
      UPDATE
      SET value = ${jsonValue}::jsonb, value_size = ${valueSize}, updated_at = ${now}
      RETURNING world_name as "worldName", player_address as "playerAddress", key, value`
    const result = await pg.query<PlayerStorageItem>(query)

    logger.debug('Player storage value set successfully', { worldName, placeId, playerAddress, key })

    return result.rows[0]
  }

  /**
   * Deletes a single value from player storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key to delete
   */
  async function deleteValue(worldName: string, placeId: string, playerAddress: string, key: string): Promise<void> {
    logger.debug('Deleting player storage value', { worldName, placeId, playerAddress, key })

    const query = SQL`DELETE FROM player_storage WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND player_address = ${playerAddress} AND key = ${key}`
    await pg.query(query)

    logger.debug('Player storage value deleted successfully', { worldName, placeId, playerAddress, key })
  }

  /**
   * Deletes all values for a specific player within a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   */
  async function deleteAllForPlayer(worldName: string, placeId: string, playerAddress: string): Promise<void> {
    logger.debug('Deleting all player storage values for player', { worldName, placeId, playerAddress })

    const query = SQL`DELETE FROM player_storage WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND player_address = ${playerAddress}`
    await pg.query(query)

    logger.debug('All player storage values deleted successfully for player', { worldName, placeId, playerAddress })
  }

  /**
   * Deletes all player values for a scene (all players)
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   */
  async function deleteAll(worldName: string, placeId: string): Promise<void> {
    logger.debug('Deleting all player storage values', { worldName, placeId })

    const query = SQL`DELETE FROM player_storage WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid`
    await pg.query(query)

    logger.debug('All player storage values deleted successfully', { worldName, placeId })
  }

  /**
   * Lists storage items (key-value pairs) for a player with pagination
   *
   * Results are ordered alphabetically by key (ASC) for deterministic pagination.
   * Each item is returned as { key, value }.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param options - Pagination and filtering options
   * @returns Array of { key, value } entries sorted by key
   */
  async function listValues(
    worldName: string,
    placeId: string,
    playerAddress: string,
    options: PaginationOptions
  ): Promise<StorageEntry[]> {
    const { limit, offset, prefix } = options

    logger.debug('Listing player storage values', {
      worldName,
      placeId,
      playerAddress,
      limit,
      offset,
      prefix: prefix ?? 'none'
    })

    const query = SQL`SELECT key, value`.append(buildValuesBaseQuery(worldName, placeId, playerAddress, prefix))
      .append(SQL`
      ORDER BY key ASC
      LIMIT ${limit} OFFSET ${offset}`)

    const result = await pg.query<StorageEntry>(query)

    logger.debug('Player storage values listed successfully', {
      worldName,
      placeId,
      playerAddress,
      count: result.rows.length
    })

    return result.rows
  }

  /**
   * Counts the total number of keys for a player
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  async function countKeys(
    worldName: string,
    placeId: string,
    playerAddress: string,
    options: Pick<PaginationOptions, 'prefix'>
  ): Promise<number> {
    const { prefix } = options

    logger.debug('Counting player storage keys', { worldName, placeId, playerAddress, prefix: prefix ?? 'none' })

    const query = SQL`SELECT COUNT(*)::int as count`.append(
      buildValuesBaseQuery(worldName, placeId, playerAddress, prefix)
    )

    const result = await pg.query<{ count: number }>(query)
    const count = result.rows[0].count

    logger.debug('Player storage keys counted successfully', { worldName, placeId, playerAddress, count })

    return count
  }

  /**
   * Builds the shared FROM + WHERE clause for player_storage queries.
   *
   * Both listValues and countKeys filter on the same criteria (world_name + place_id + player_address + optional prefix).
   * This helper centralises that logic so it is defined once.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param prefix - Optional key prefix filter
   * @returns A SQLStatement containing the FROM and WHERE clauses
   */
  function buildValuesBaseQuery(
    worldName: string,
    placeId: string,
    playerAddress: string,
    prefix?: string
  ): SQLStatement {
    const prefixPattern = buildPrefixPattern(prefix)
    return SQL`
      FROM player_storage
      WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND player_address = ${playerAddress}
        AND (${prefixPattern}::text IS NULL OR key LIKE ${prefixPattern})`
  }

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
  async function listPlayers(
    worldName: string,
    placeId: string,
    options: Pick<PaginationOptions, 'limit' | 'offset'>
  ): Promise<string[]> {
    const { limit, offset } = options

    logger.debug('Listing players with stored values', { worldName, placeId, limit, offset })

    const query = SQL`
      SELECT DISTINCT player_address
      FROM player_storage
      WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid
      ORDER BY player_address ASC
      LIMIT ${limit} OFFSET ${offset}`

    const result = await pg.query<{ player_address: string }>(query)

    logger.debug('Players listed successfully', { worldName, placeId, count: result.rows.length })

    return result.rows.map(row => row.player_address)
  }

  /**
   * Counts the total number of distinct players that have stored values in a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @returns Total count of distinct players
   */
  async function countPlayers(worldName: string, placeId: string): Promise<number> {
    logger.debug('Counting distinct players', { worldName, placeId })

    const query = SQL`
      SELECT COUNT(DISTINCT player_address)::int as count
      FROM player_storage
      WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid`

    const result = await pg.query<{ count: number }>(query)
    const count = result.rows[0].count

    logger.debug('Players counted successfully', { worldName, placeId, count })

    return count
  }

  /**
   * Returns storage size info for a player scope in a world in a single query.
   *
   * If `key` is provided, this returns the existing value size for that key and
   * the total size for the player's scope. If `key` is omitted, `existingValueSize`
   * is set to 0 and only total usage is relevant.
   *
   * Size aggregation is always per-world (across all scenes).
   *
   * @param worldName - The world identifier
   * @param playerAddress - The player's wallet address
   * @param key - Optional storage key
   * @returns Existing value size and total storage size
   */
  async function getSizeInfo(
    worldName: string,
    playerAddress: string,
    key?: string
  ): Promise<{ existingValueSize: number; totalSize: number }> {
    const keyFilter = key ?? null
    const query = SQL`
      SELECT
        COALESCE(MAX(value_size) FILTER (WHERE key = ${keyFilter}), 0) AS existing_value_size,
        COALESCE(SUM(value_size), 0)::int AS total_size
      FROM player_storage
      WHERE world_name = ${worldName} AND player_address = ${playerAddress}`

    const result = await pg.query<{ existing_value_size: number; total_size: number }>(query)
    const existingValueSize = result.rows[0].existing_value_size
    const totalSize = result.rows[0].total_size

    return { existingValueSize, totalSize }
  }

  return {
    getValue,
    setValue,
    deleteValue,
    deleteAllForPlayer,
    deleteAll,
    listValues,
    countKeys,
    listPlayers,
    countPlayers,
    getSizeInfo
  }
}
