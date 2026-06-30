import { SQL } from 'sql-template-strings'
import { calculateValueSizeInBytes } from '../../utils/calculateValueSizeInBytes'
import { buildPrefixPattern } from '../../utils/prefix'
import type { IWorldStorageComponent } from './types'
import type { AppComponents } from '../../types'
import type { PaginationOptions } from '../../types/http'
import type { SQLStatement } from 'sql-template-strings'

/**
 * Creates the world storage component that manages world-level key-value storage.
 *
 * Single-key reads (`getValue`) are served through an in-memory read-through cache (`storageCache`)
 * and invalidated on `setValue`/`deleteValue`/`deleteAll`. The paginated `listValues`/`countKeys`
 * are NOT cached (the listing is write-invalidated on every change to a write-heavy scene, so the
 * hit rate would be marginal) — they still avoid per-row JSON parsing via `value::text`. Because
 * the cache is per-instance, the configured TTL — not invalidation — is what bounds staleness on
 * replicas that did not handle the write.
 *
 * @param components - Required components: pg (database), config, storageCache, logs (logger)
 * @returns IWorldStorageComponent implementation
 */
export const createWorldStorageComponent = async ({
  pg,
  config,
  storageCache,
  logs
}: Pick<AppComponents, 'pg' | 'config' | 'storageCache' | 'logs'>): Promise<IWorldStorageComponent> => {
  const logger = logs.getLogger('world-storage')

  const cacheEnabled = (await config.getString('STORAGE_CACHE_ENABLED')) !== 'false'
  const maxCachedValueSizeInBytes = (await config.getNumber('STORAGE_CACHE_MAX_VALUE_BYTES')) ?? 32_768

  const VALUE_CACHE_PREFIX = 'world-storage:value'

  // Only single-key reads are cached. The paginated `GET /values` listing is intentionally NOT
  // cached: it is write-invalidated on every change to the scene (world storage is write-heavy),
  // so the hit rate would be marginal while adding invalidation work to every write.

  // Single-value entries are namespaced per scene and key. `worldName` ("foo.dcl.eth")
  // and `placeId` (a UUID) never contain ":", so the trailing user-supplied key cannot
  // collide across scenes.
  function valueCacheKey(worldName: string, placeId: string, key: string): string {
    return `${VALUE_CACHE_PREFIX}:${worldName}:${placeId}:${key}`
  }

  // Invalidates the cached single value for a key.
  async function invalidateKey(worldName: string, placeId: string, key: string): Promise<void> {
    if (!cacheEnabled) return
    await storageCache.remove(valueCacheKey(worldName, placeId, key))
  }

  // Clears every cached single value for a scene (used when all of a scene's keys are removed).
  async function invalidateScene(worldName: string, placeId: string): Promise<void> {
    if (!cacheEnabled) return
    const keys = await storageCache.keys(`${VALUE_CACHE_PREFIX}:${worldName}:${placeId}:*`)
    await Promise.all(keys.map(cacheKey => storageCache.remove(cacheKey)))
  }

  /**
   * Retrieves a single value from world storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  async function getValue(worldName: string, placeId: string, key: string): Promise<string | null> {
    if (cacheEnabled) {
      const cached = await storageCache.get<string>(valueCacheKey(worldName, placeId, key))
      // `value` is NOT NULL in the schema, so a missing row is the only source of null here — the
      // cache returning null is unambiguously a miss (misses are never cached, see below).
      if (cached !== null) {
        logger.debug('World storage value retrieved from cache', { worldName, placeId, key })
        return cached
      }
    }

    logger.debug('Fetching world storage value', { worldName, placeId, key })

    // Select the value already serialized as JSON text. Otherwise node-postgres JSON.parses every
    // jsonb result on the event loop, only for it to be re-serialized into the HTTP response;
    // `::text` lets the value pass straight through, parsed by neither side.
    const query = SQL`SELECT value::text AS value FROM world_storage WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND key = ${key}`
    const result = await pg.query<{ value: string }>(query)
    const value = result.rows[0]?.value ?? null

    // Cache present, reasonably-sized values. Misses are not cached (null is the miss sentinel) and
    // oversized values are skipped to keep the entry-count-capped cache bounded.
    if (cacheEnabled && value !== null) {
      const valueSize = calculateValueSizeInBytes(value)
      if (valueSize <= maxCachedValueSizeInBytes) {
        await storageCache.set(valueCacheKey(worldName, placeId, key), value)
      }
    }

    logger.debug(value === null ? 'World storage value not found' : 'World storage value retrieved successfully', {
      worldName,
      placeId,
      key
    })

    return value
  }

  /**
   * Creates or updates a value in world storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key
   * @param value - The value to store
   * @returns The stored item
   */
  async function setValue(worldName: string, placeId: string, key: string, serializedValue: string): Promise<void> {
    logger.debug('Setting world storage value', { worldName, placeId, key })

    const now = new Date().toISOString()
    const valueSize = calculateValueSizeInBytes(serializedValue)
    // The value arrives already serialized (the caller serialized it once for validation), so it is
    // stored as jsonb directly. `RETURNING value` is intentionally omitted: it would force PG to
    // send the value back and node-postgres to re-parse it, and the caller already has it.
    const query = SQL`
      INSERT INTO world_storage (world_name, place_id, key, value, value_size, created_at, updated_at)
      VALUES (${worldName}, ${placeId}::uuid, ${key}, ${serializedValue}::jsonb, ${valueSize}, ${now}, ${now})
      ON CONFLICT (world_name, place_id, key) DO
      UPDATE
      SET value = ${serializedValue}::jsonb, value_size = ${valueSize}, updated_at = ${now}`
    await pg.query(query)

    await invalidateKey(worldName, placeId, key)

    logger.debug('World storage value set successfully', { worldName, placeId, key })
  }

  /**
   * Deletes a single value from world storage
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The storage key to delete
   */
  async function deleteValue(worldName: string, placeId: string, key: string): Promise<void> {
    logger.debug('Deleting world storage value', { worldName, placeId, key })

    const query = SQL`DELETE FROM world_storage WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND key = ${key}`
    await pg.query(query)

    await invalidateKey(worldName, placeId, key)

    logger.debug('World storage value deleted successfully', { worldName, placeId, key })
  }

  /**
   * Deletes all values for a scene within a world
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   */
  async function deleteAll(worldName: string, placeId: string): Promise<void> {
    logger.debug('Deleting all world storage values', { worldName, placeId })

    const query = SQL`DELETE FROM world_storage WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid`
    await pg.query(query)

    await invalidateScene(worldName, placeId)

    logger.debug('All world storage values deleted successfully', { worldName, placeId })
  }

  /**
   * Lists storage items (key-value pairs) for a scene with pagination
   *
   * Results are ordered alphabetically by key (ASC) for deterministic pagination.
   * Each item is returned as { key, value }.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Pagination and filtering options
   * @returns The page as a JSON array text of { key, value } entries sorted by key (e.g. `[{"key":"k","value":1}]`)
   */
  async function listValues(worldName: string, placeId: string, options: PaginationOptions): Promise<string> {
    const { limit, offset, prefix } = options

    logger.debug('Listing world storage values', { worldName, placeId, limit, offset, prefix: prefix ?? 'none' })

    // Select each value as JSON text so node-postgres doesn't JSON.parse every jsonb row; the page is
    // assembled into a JSON array by splicing that text verbatim, so the values are neither parsed
    // here nor re-serialized by the response layer. Only the (small) keys are escaped. The listing
    // itself is not cached (see the note near the cache helpers).
    const query = SQL`SELECT key, value::text AS value`.append(buildValuesBaseQuery(worldName, placeId, prefix))
      .append(SQL`
      ORDER BY key ASC
      LIMIT ${limit} OFFSET ${offset}`)

    const result = await pg.query<{ key: string; value: string }>(query)
    const dataText = `[${result.rows.map(row => `{"key":${JSON.stringify(row.key)},"value":${row.value}}`).join(',')}]`

    logger.debug('World storage values listed successfully', { worldName, placeId, count: result.rows.length })

    return dataText
  }

  /**
   * Counts the total number of keys for a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  async function countKeys(
    worldName: string,
    placeId: string,
    options: Pick<PaginationOptions, 'prefix'>
  ): Promise<number> {
    const { prefix } = options

    logger.debug('Counting world storage keys', { worldName, placeId, prefix: prefix ?? 'none' })

    const query = SQL`SELECT COUNT(*)::int as count`.append(buildValuesBaseQuery(worldName, placeId, prefix))

    const result = await pg.query<{ count: number }>(query)
    const count = result.rows[0].count

    logger.debug('World storage keys counted successfully', { worldName, placeId, count })

    return count
  }

  /**
   * Builds the shared FROM + WHERE clause for world_storage queries.
   *
   * Both listValues and countKeys filter on the same criteria (world_name + place_id + optional prefix).
   * This helper centralises that logic so it is defined once.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param prefix - Optional key prefix filter
   * @returns A SQLStatement containing the FROM and WHERE clauses
   */
  function buildValuesBaseQuery(worldName: string, placeId: string, prefix?: string): SQLStatement {
    const prefixPattern = buildPrefixPattern(prefix)
    return SQL`
      FROM world_storage
      WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid
        AND (${prefixPattern}::text IS NULL OR key LIKE ${prefixPattern})`
  }

  /**
   * Returns storage size info for a world in a single database query.
   *
   * If `key` is provided, this returns the existing value size for that key and
   * the current total size for the world. If `key` is omitted, `existingValueSize`
   * is set to 0 and only the total size is meaningful.
   *
   * Size aggregation is always per-world (across all scenes).
   *
   * @param worldName - The world identifier
   * @param key - Optional storage key
   * @returns Existing value size and total storage size
   */
  async function getSizeInfo(
    worldName: string,
    key?: string
  ): Promise<{ existingValueSize: number; totalSize: number }> {
    const keyFilter = key ?? null
    const query = SQL`
      SELECT
        COALESCE(MAX(value_size) FILTER (WHERE key = ${keyFilter}), 0) AS existing_value_size,
        COALESCE(SUM(value_size), 0)::int AS total_size
      FROM world_storage
      WHERE world_name = ${worldName}`

    const result = await pg.query<{ existing_value_size: number; total_size: number }>(query)
    const existingValueSize = result.rows[0].existing_value_size
    const totalSize = result.rows[0].total_size

    return { existingValueSize, totalSize }
  }

  return {
    getValue,
    setValue,
    deleteValue,
    deleteAll,
    listValues,
    countKeys,
    getSizeInfo
  }
}
