import { SQL } from 'sql-template-strings'
import { calculateValueSizeInBytes } from '../../utils/calculateValueSizeInBytes'
import { buildPrefixPattern } from '../../utils/prefix'
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
   * @param key - The environment variable key
   * @returns The decrypted value or null if not found
   */
  async function getValue(worldName: string, key: string): Promise<string | null> {
    logger.debug('Fetching env variable', { worldName, key })

    const query = SQL`SELECT value_enc FROM env_variables WHERE world_name = ${worldName} AND key = ${key}`
    const result = await pg.query<{ value_enc: Buffer }>(query)

    if (!result.rows[0]?.value_enc) {
      logger.debug('Env variable not found', { worldName, key })
      return null
    }

    logger.debug('Decrypting env variable', { worldName, key })
    const decryptedValue = encryption.decrypt(result.rows[0].value_enc)
    logger.debug('Env variable retrieved and decrypted successfully', { worldName, key })

    return decryptedValue
  }

  /**
   * Creates or updates an environment variable
   *
   * @param worldName - The world identifier
   * @param key - The environment variable key
   * @param value - The value to encrypt and store
   */
  async function setValue(worldName: string, key: string, value: string): Promise<void> {
    logger.debug('Encrypting and storing env variable', { worldName, key })

    const now = new Date().toISOString()
    const valueSize = calculateValueSizeInBytes(value)
    const encryptedValue = encryption.encrypt(value)
    const query = SQL`
      INSERT INTO env_variables (world_name, key, value_enc, value_size, created_at, updated_at)
      VALUES (${worldName}, ${key}, ${encryptedValue}, ${valueSize}, ${now}, ${now})
      ON CONFLICT (world_name, key) DO
      UPDATE
      SET value_enc = ${encryptedValue}, value_size = ${valueSize}, updated_at = ${now}`
    await pg.query(query)

    logger.debug('Env variable stored successfully', { worldName, key })
  }

  /**
   * Deletes a single environment variable
   *
   * @param worldName - The world identifier
   * @param key - The environment variable key to delete
   */
  async function deleteValue(worldName: string, key: string): Promise<void> {
    logger.debug('Deleting env variable', { worldName, key })

    const query = SQL`DELETE FROM env_variables WHERE world_name = ${worldName} AND key = ${key}`
    await pg.query(query)

    logger.debug('Env variable deleted successfully', { worldName, key })
  }

  /**
   * Deletes all environment variables for a world
   *
   * @param worldName - The world identifier
   */
  async function deleteAll(worldName: string): Promise<void> {
    logger.debug('Deleting all env variables', { worldName })

    const query = SQL`DELETE FROM env_variables WHERE world_name = ${worldName}`
    await pg.query(query)

    logger.debug('All env variables deleted successfully', { worldName })
  }

  /**
   * Lists environment variable keys (names only, no values) for a world
   *
   * Values are intentionally NOT returned to protect secrets.
   * Results are ordered alphabetically by key (ASC) for deterministic pagination.
   *
   * @param worldName - The world identifier
   * @param options - Pagination and filtering options
   * @returns Array of key names sorted alphabetically
   */
  async function listKeys(worldName: string, options: PaginationOptions): Promise<string[]> {
    const { limit, offset, prefix } = options

    logger.debug('Listing env variable keys', { worldName, limit, offset, prefix: prefix ?? 'none' })

    const query = SQL`SELECT key`.append(buildKeysBaseQuery(worldName, prefix)).append(SQL`
      ORDER BY key ASC
      LIMIT ${limit} OFFSET ${offset}`)

    const result = await pg.query<{ key: string }>(query)
    const keys = result.rows.map(row => row.key)

    logger.debug('Env variable keys listed successfully', { worldName, count: keys.length })

    return keys
  }

  /**
   * Counts the total number of environment variable keys for a world
   *
   * @param worldName - The world identifier
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  async function countKeys(worldName: string, options: Pick<PaginationOptions, 'prefix'>): Promise<number> {
    const { prefix } = options

    logger.debug('Counting env variable keys', { worldName, prefix: prefix ?? 'none' })

    const query = SQL`SELECT COUNT(*)::int as count`.append(buildKeysBaseQuery(worldName, prefix))

    const result = await pg.query<{ count: number }>(query)
    const count = result.rows[0].count

    logger.debug('Env variable keys counted successfully', { worldName, count })

    return count
  }

  /**
   * Builds the shared FROM + WHERE clause for env_variables key queries.
   *
   * Both listKeys and countKeys filter on the same criteria (world_name + optional prefix).
   * This helper centralises that logic so it is defined once.
   *
   * @param worldName - The world identifier
   * @param prefix - Optional key prefix filter
   * @returns A SQLStatement containing the FROM and WHERE clauses
   */
  function buildKeysBaseQuery(worldName: string, prefix?: string): SQLStatement {
    const prefixPattern = buildPrefixPattern(prefix)
    return SQL`
      FROM env_variables
      WHERE world_name = ${worldName}
        AND (${prefixPattern}::text IS NULL OR key LIKE ${prefixPattern})`
  }

  /**
   * Returns the existing value's plaintext byte size and the total storage size for a world
   * in a single database query. Used by the storage limits validator to efficiently
   * compute projected total size without fetching/decrypting the full value.
   *
   * @param worldName - The world identifier
   * @param key - The environment variable key being upserted
   * @returns The existing value's byte size (0 if key does not exist) and the total storage size
   */
  async function getUpsertSizeInfo(
    worldName: string,
    key: string
  ): Promise<{ existingValueSize: number; totalSize: number }> {
    const query = SQL`
      SELECT
        COALESCE((SELECT value_size FROM env_variables WHERE world_name = ${worldName} AND key = ${key}), 0) AS existing_value_size,
        COALESCE(SUM(value_size), 0)::int AS total_size
      FROM env_variables
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
    listKeys,
    countKeys,
    getUpsertSizeInfo
  }
}
