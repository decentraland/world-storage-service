import { SQL } from 'sql-template-strings'
import { calculateValueSizeInBytes } from '../../utils/calculateValueSizeInBytes'
import { buildPrefixPattern } from '../../utils/prefix'
import type { IPlayerStorageComponent } from './types'
import type { AppComponents } from '../../types'
import type { PaginationOptions } from '../../types/http'
import type { SQLStatement } from 'sql-template-strings'

/**
 * Creates the player storage component that manages player-level key-value storage within worlds.
 *
 * Single-key reads (`getValue`) are served through an in-memory read-through cache
 * (`storageCache`). Every mutation invalidates the affected cache entries on the instance
 * that handled the write: `setValue`/`deleteValue` invalidate a single key, `deleteAllForPlayer`
 * invalidates one player's keys, and `deleteAll` invalidates the whole scene. Because the cache
 * is per-instance, the configured TTL — not invalidation — is what bounds staleness on replicas
 * that did not handle the write.
 *
 * @param components - Required components: pg (database), config, storageCache, logs (logger)
 * @returns IPlayerStorageComponent implementation
 */
export const createPlayerStorageComponent = async ({
  pg,
  config,
  storageCache,
  logs
}: Pick<AppComponents, 'pg' | 'config' | 'storageCache' | 'logs'>): Promise<IPlayerStorageComponent> => {
  const logger = logs.getLogger('player-storage')

  const cacheEnabled = (await config.getString('STORAGE_CACHE_ENABLED')) !== 'false'
  const maxCachedValueSizeInBytes = (await config.getNumber('STORAGE_CACHE_MAX_VALUE_BYTES')) ?? 32_768

  const CACHE_PREFIX = 'player-storage:value'

  // Cache keys are namespaced per scene and player so the scene- and player-level deletes
  // can wipe their entries with a single prefix glob. `worldName` (e.g. "foo.dcl.eth"),
  // `placeId` (a UUID) and `playerAddress` (a 0x-prefixed hex address) never contain the
  // ":" separator, so the trailing user-supplied key cannot collide across scopes.
  function valueCacheKey(worldName: string, placeId: string, playerAddress: string, key: string): string {
    return `${CACHE_PREFIX}:${worldName}:${placeId}:${playerAddress}:${key}`
  }

  async function invalidateKey(worldName: string, placeId: string, playerAddress: string, key: string): Promise<void> {
    if (!cacheEnabled) return
    await storageCache.remove(valueCacheKey(worldName, placeId, playerAddress, key))
  }

  async function invalidateByPattern(pattern: string): Promise<void> {
    if (!cacheEnabled) return
    const keys = await storageCache.keys(pattern)
    await Promise.all(keys.map(cacheKey => storageCache.remove(cacheKey)))
  }

  async function invalidatePlayer(worldName: string, placeId: string, playerAddress: string): Promise<void> {
    await invalidateByPattern(`${CACHE_PREFIX}:${worldName}:${placeId}:${playerAddress}:*`)
  }

  async function invalidateScene(worldName: string, placeId: string): Promise<void> {
    await invalidateByPattern(`${CACHE_PREFIX}:${worldName}:${placeId}:*`)
  }

  /**
   * Retrieves a single value from player storage as raw JSON text.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @returns The stored value as JSON text, or null if the key does not exist
   */
  async function getValue(
    worldName: string,
    placeId: string,
    playerAddress: string,
    key: string
  ): Promise<string | null> {
    if (cacheEnabled) {
      const cached = await storageCache.get<string>(valueCacheKey(worldName, placeId, playerAddress, key))
      // `value` is NOT NULL in the schema, so a missing row is the only source of null here — the
      // cache returning null is unambiguously a miss (misses are never cached, see below).
      if (cached !== null) {
        logger.debug('Player storage value retrieved from cache', { worldName, placeId, playerAddress, key })
        return cached
      }
    }

    logger.debug('Fetching player storage value', { worldName, placeId, playerAddress, key })

    // Select the value already serialized as JSON text. Otherwise node-postgres JSON.parses every
    // jsonb result on the event loop, only for it to be re-serialized into the HTTP response;
    // `::text` lets the value pass straight through, parsed by neither side.
    const query = SQL`SELECT value::text AS value FROM player_storage WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND player_address = ${playerAddress} AND key = ${key}`
    const result = await pg.query<{ value: string }>(query)
    const value = result.rows[0]?.value ?? null

    // Cache present, reasonably-sized values. Misses are not cached (null is the miss sentinel) and
    // oversized values are skipped to keep the entry-count-capped cache bounded.
    if (cacheEnabled && value !== null) {
      const valueSize = calculateValueSizeInBytes(value)
      if (valueSize <= maxCachedValueSizeInBytes) {
        await storageCache.set(valueCacheKey(worldName, placeId, playerAddress, key), value)
      }
    }

    logger.debug(value === null ? 'Player storage value not found' : 'Player storage value retrieved successfully', {
      worldName,
      placeId,
      playerAddress,
      key
    })

    return value
  }

  /**
   * Creates or updates a value in player storage.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param playerAddress - The player's wallet address
   * @param key - The storage key
   * @param serializedValue - The value already serialized as JSON text (stored verbatim as jsonb)
   */
  async function setValue(
    worldName: string,
    placeId: string,
    playerAddress: string,
    key: string,
    serializedValue: string
  ): Promise<void> {
    logger.debug('Setting player storage value', { worldName, placeId, playerAddress, key })

    const now = new Date().toISOString()
    const valueSize = calculateValueSizeInBytes(serializedValue)
    // The value arrives already serialized (the caller serialized it once for validation), so it is
    // stored as jsonb directly. `RETURNING value` is intentionally omitted: it would force PG to
    // send the value back and node-postgres to re-parse it, and the caller already has it.
    const query = SQL`
      INSERT INTO player_storage (world_name, place_id, player_address, key, value, value_size, created_at, updated_at)
      VALUES (${worldName}, ${placeId}::uuid, ${playerAddress}, ${key}, ${serializedValue}::jsonb, ${valueSize}, ${now}, ${now})
      ON CONFLICT (world_name, place_id, player_address, key) DO
      UPDATE
      SET value = ${serializedValue}::jsonb, value_size = ${valueSize}, updated_at = ${now}`
    await pg.query(query)

    await invalidateKey(worldName, placeId, playerAddress, key)

    logger.debug('Player storage value set successfully', { worldName, placeId, playerAddress, key })
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

    await invalidateKey(worldName, placeId, playerAddress, key)

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

    await invalidatePlayer(worldName, placeId, playerAddress)

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

    await invalidateScene(worldName, placeId)

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
  ): Promise<string> {
    const { limit, offset, prefix } = options

    logger.debug('Listing player storage values', {
      worldName,
      placeId,
      playerAddress,
      limit,
      offset,
      prefix: prefix ?? 'none'
    })

    // Select each value as JSON text so node-postgres doesn't JSON.parse every jsonb row; the page is
    // assembled into a JSON array by splicing that text verbatim, so the values are neither parsed
    // here nor re-serialized by the response layer. Only the (small) keys are escaped.
    const query = SQL`SELECT key, value::text AS value`.append(
      buildValuesBaseQuery(worldName, placeId, playerAddress, prefix)
    ).append(SQL`
      ORDER BY key ASC
      LIMIT ${limit} OFFSET ${offset}`)

    const result = await pg.query<{ key: string; value: string }>(query)
    const dataText = `[${result.rows.map(row => `{"key":${JSON.stringify(row.key)},"value":${row.value}}`).join(',')}]`

    logger.debug('Player storage values listed successfully', {
      worldName,
      placeId,
      playerAddress,
      count: result.rows.length
    })

    return dataText
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
