import { SQL } from 'sql-template-strings'
import { calculateValueSizeInBytes } from '../../utils/calculateValueSizeInBytes'
import { buildPrefixPattern } from '../../utils/prefix'
import { isSharedRealmName } from '../../utils/worldName'
import type { IEnvStorageComponent } from './types'
import type { AppComponents } from '../../types'
import type { PaginationOptions } from '../../types/http'
import type { SQLStatement } from 'sql-template-strings'

/**
 * Creates the env storage component that manages encrypted environment variables for worlds.
 *
 * This component handles sensitive data (environment variables) and ensures they are
 * encrypted at rest. Logging is intentionally minimal to avoid exposing secrets.
 *
 * @param components - Required components: pg (database), encryption, logs (logger)
 * @returns IEnvStorageComponent implementation
 */
export const createEnvStorageComponent = ({
  pg,
  encryption,
  logs
}: Pick<AppComponents, 'pg' | 'encryption' | 'logs'>): IEnvStorageComponent => {
  const logger = logs.getLogger('env-storage')

  /**
   * Retrieves a single environment variable value
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The environment variable key
   * @returns The decrypted value or null if not found
   */
  async function getValue(worldName: string, placeId: string, key: string): Promise<string | null> {
    logger.debug('Fetching env variable', { worldName, placeId, key })

    const query = SQL`SELECT value_enc FROM env_variables WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND key = ${key}`
    const result = await pg.query<{ value_enc: Buffer }>(query)

    if (!result.rows[0]?.value_enc) {
      logger.debug('Env variable not found', { worldName, placeId, key })
      return null
    }

    logger.debug('Decrypting env variable', { worldName, placeId, key })
    const decryptedValue = encryption.decrypt(result.rows[0].value_enc)
    logger.debug('Env variable retrieved and decrypted successfully', { worldName, placeId, key })

    return decryptedValue
  }

  /**
   * Creates or updates an environment variable
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The environment variable key
   * @param value - The value to encrypt and store
   */
  async function setValue(worldName: string, placeId: string, key: string, value: string): Promise<void> {
    logger.debug('Encrypting and storing env variable', { worldName, placeId, key })

    const now = new Date().toISOString()
    const valueSize = calculateValueSizeInBytes(value)
    const encryptedValue = encryption.encrypt(value)
    const query = SQL`
      INSERT INTO env_variables (world_name, place_id, key, value_enc, value_size, created_at, updated_at)
      VALUES (${worldName}, ${placeId}::uuid, ${key}, ${encryptedValue}, ${valueSize}, ${now}, ${now})
      ON CONFLICT (world_name, place_id, key) DO
      UPDATE
      SET value_enc = ${encryptedValue}, value_size = ${valueSize}, updated_at = ${now}`
    await pg.query(query)

    logger.debug('Env variable stored successfully', { worldName, placeId, key })
  }

  /**
   * Deletes a single environment variable
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - The environment variable key to delete
   */
  async function deleteValue(worldName: string, placeId: string, key: string): Promise<void> {
    logger.debug('Deleting env variable', { worldName, placeId, key })

    const query = SQL`DELETE FROM env_variables WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND key = ${key}`
    await pg.query(query)

    logger.debug('Env variable deleted successfully', { worldName, placeId, key })
  }

  /**
   * Deletes all environment variables for a scene
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   */
  async function deleteAll(worldName: string, placeId: string): Promise<void> {
    logger.debug('Deleting all env variables', { worldName, placeId })

    const query = SQL`DELETE FROM env_variables WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid`
    await pg.query(query)

    logger.debug('All env variables deleted successfully', { worldName, placeId })
  }

  /**
   * Lists environment variable keys (names only, no values) for a scene
   *
   * Values are intentionally NOT returned to protect secrets.
   * Results are ordered alphabetically by key (ASC) for deterministic pagination.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param options - Pagination and filtering options
   * @returns Array of key names sorted alphabetically
   */
  async function listKeys(worldName: string, placeId: string, options: PaginationOptions): Promise<string[]> {
    const { limit, offset, prefix } = options

    logger.debug('Listing env variable keys', { worldName, placeId, limit, offset, prefix: prefix ?? 'none' })

    const query = SQL`SELECT key`.append(buildKeysBaseQuery(worldName, placeId, prefix)).append(SQL`
      ORDER BY key ASC
      LIMIT ${limit} OFFSET ${offset}`)

    const result = await pg.query<{ key: string }>(query)
    const keys = result.rows.map(row => row.key)

    logger.debug('Env variable keys listed successfully', { worldName, placeId, count: keys.length })

    return keys
  }

  /**
   * Counts the total number of environment variable keys for a scene
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

    logger.debug('Counting env variable keys', { worldName, placeId, prefix: prefix ?? 'none' })

    const query = SQL`SELECT COUNT(*)::int as count`.append(buildKeysBaseQuery(worldName, placeId, prefix))

    const result = await pg.query<{ count: number }>(query)
    const count = result.rows[0].count

    logger.debug('Env variable keys counted successfully', { worldName, placeId, count })

    return count
  }

  /**
   * Builds the shared FROM + WHERE clause for env_variables key queries.
   *
   * Both listKeys and countKeys filter on the same criteria (world_name + place_id + optional prefix).
   * This helper centralises that logic so it is defined once.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param prefix - Optional key prefix filter
   * @returns A SQLStatement containing the FROM and WHERE clauses
   */
  function buildKeysBaseQuery(worldName: string, placeId: string, prefix?: string): SQLStatement {
    const prefixPattern = buildPrefixPattern(prefix)
    return SQL`
      FROM env_variables
      WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid
        AND (${prefixPattern}::text IS NULL OR key LIKE ${prefixPattern})`
  }

  /**
   * Returns storage size info for an env quota scope in a single query.
   *
   * If `key` is provided, this returns the existing value size for that exact
   * `(place_id, key)` row and the total env usage for the scope. If `key` is
   * omitted, `existingValueSize` is set to 0.
   *
   * Totals are aggregated per world (across all scenes) for `*.dcl.eth` worlds, and
   * per place for shared Genesis City realms — unrelated land scenes must not compete
   * for (or disclose) a single realm-wide pool.
   *
   * @param worldName - The world identifier
   * @param placeId - The place ID (UUID) of the scene
   * @param key - Optional environment variable key
   * @returns Existing value size and total storage size
   */
  async function getSizeInfo(
    worldName: string,
    placeId: string,
    key?: string
  ): Promise<{ existingValueSize: number; totalSize: number }> {
    const keyFilter = key ?? null
    // The existing-value credit must match the exact row being replaced: rows are keyed
    // (world_name, place_id, key), so filtering by key alone would credit a same-named
    // key from another scene and let the quota be exceeded.
    const query = SQL`
      SELECT
        COALESCE(MAX(value_size) FILTER (WHERE place_id = ${placeId}::uuid AND key = ${keyFilter}), 0) AS existing_value_size,
        COALESCE(SUM(value_size), 0)::bigint AS total_size
      FROM env_variables
      WHERE world_name = ${worldName}`
    if (isSharedRealmName(worldName)) {
      query.append(SQL` AND place_id = ${placeId}::uuid`)
    }

    const result = await pg.query<{ existing_value_size: number; total_size: string }>(query)
    const existingValueSize = result.rows[0].existing_value_size
    // SUM is cast to bigint (an int cast overflows at 2 GB and would 500 every request in
    // the scope); node-postgres returns bigint as text, and totals fit safely in a JS number.
    const totalSize = Number(result.rows[0].total_size)

    return { existingValueSize, totalSize }
  }

  return {
    getValue,
    setValue,
    deleteValue,
    deleteAll,
    listKeys,
    countKeys,
    getSizeInfo
  }
}
