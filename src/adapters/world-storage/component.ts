import { SQL } from 'sql-template-strings'
import { buildPrefixPattern } from '../../utils/prefix'
import type { IWorldStorageComponent, WorldStorageItem } from './types'
import type { AppComponents } from '../../types'
import type { StorageEntry } from '../../types/commons'
import type { PaginationOptions } from '../../types/http'
import type { SQLStatement } from 'sql-template-strings'

/**
 * Creates the world storage component that manages world-level key-value storage.
 *
 * @param components - Required components: pg (database), logs (logger)
 * @returns IWorldStorageComponent implementation
 */
export const createWorldStorageComponent = ({
  pg,
  logs
}: Pick<AppComponents, 'pg' | 'logs'>): IWorldStorageComponent => {
  const logger = logs.getLogger('world-storage')

  /**
   * Retrieves a single value from world storage
   *
   * @param worldName - The world identifier
   * @param key - The storage key
   * @returns The stored value or null if not found
   */
  async function getValue(worldName: string, key: string): Promise<unknown | null> {
    logger.debug('Fetching world storage value', { worldName, key })

    const query = SQL`SELECT value FROM world_storage WHERE world_name = ${worldName} AND key = ${key}`
    const result = await pg.query<Pick<WorldStorageItem, 'value'>>(query)
    const value = result.rows[0]?.value ?? null

    logger.debug(value === null ? 'World storage value not found' : 'World storage value retrieved successfully', {
      worldName,
      key
    })

    return value
  }

  /**
   * Creates or updates a value in world storage
   *
   * @param worldName - The world identifier
   * @param key - The storage key
   * @param value - The value to store
   * @returns The stored item
   */
  async function setValue(worldName: string, key: string, value: unknown): Promise<WorldStorageItem> {
    logger.debug('Setting world storage value', { worldName, key })

    const now = new Date().toISOString()
    const jsonValue = JSON.stringify(value)
    const query = SQL`
      INSERT INTO world_storage (world_name, key, value, created_at, updated_at)
      VALUES (${worldName}, ${key}, ${jsonValue}::jsonb, ${now}, ${now})
      ON CONFLICT (world_name, key) DO
      UPDATE
      SET value = ${jsonValue}::jsonb, updated_at = ${now}
      RETURNING world_name as "worldName", key, value`
    const result = await pg.query<WorldStorageItem>(query)

    logger.debug('World storage value set successfully', { worldName, key })

    return result.rows[0]
  }

  /**
   * Deletes a single value from world storage
   *
   * @param worldName - The world identifier
   * @param key - The storage key to delete
   */
  async function deleteValue(worldName: string, key: string): Promise<void> {
    logger.debug('Deleting world storage value', { worldName, key })

    const query = SQL`DELETE FROM world_storage WHERE world_name = ${worldName} AND key = ${key}`
    await pg.query(query)

    logger.debug('World storage value deleted successfully', { worldName, key })
  }

  /**
   * Deletes all values for a world
   *
   * @param worldName - The world identifier
   */
  async function deleteAll(worldName: string): Promise<void> {
    logger.debug('Deleting all world storage values', { worldName })

    const query = SQL`DELETE FROM world_storage WHERE world_name = ${worldName}`
    await pg.query(query)

    logger.debug('All world storage values deleted successfully', { worldName })
  }

  /**
   * Lists storage items (key-value pairs) for a world with pagination
   *
   * Results are ordered alphabetically by key (ASC) for deterministic pagination.
   * Each item is returned as { key, value }.
   *
   * @param worldName - The world identifier
   * @param options - Pagination and filtering options
   * @returns Array of { key, value } entries sorted by key
   */
  async function listValues(worldName: string, options: PaginationOptions): Promise<StorageEntry[]> {
    const { limit, offset, prefix } = options

    logger.debug('Listing world storage values', { worldName, limit, offset, prefix: prefix ?? 'none' })

    const query = SQL`SELECT key, value`.append(buildValuesBaseQuery(worldName, prefix)).append(SQL`
      ORDER BY key ASC
      LIMIT ${limit} OFFSET ${offset}`)

    const result = await pg.query<StorageEntry>(query)

    logger.debug('World storage values listed successfully', { worldName, count: result.rows.length })

    return result.rows
  }

  /**
   * Counts the total number of keys for a world
   *
   * @param worldName - The world identifier
   * @param options - Optional prefix filter
   * @returns Total count of matching keys
   */
  async function countKeys(worldName: string, options: Pick<PaginationOptions, 'prefix'>): Promise<number> {
    const { prefix } = options

    logger.debug('Counting world storage keys', { worldName, prefix: prefix ?? 'none' })

    const query = SQL`SELECT COUNT(*)::int as count`.append(buildValuesBaseQuery(worldName, prefix))

    const result = await pg.query<{ count: number }>(query)
    const count = result.rows[0]?.count ?? 0

    logger.debug('World storage keys counted successfully', { worldName, count })

    return count
  }

  /**
   * Builds the shared FROM + WHERE clause for world_storage queries.
   *
   * Both listValues and countKeys filter on the same criteria (world_name + optional prefix).
   * This helper centralises that logic so it is defined once.
   *
   * @param worldName - The world identifier
   * @param prefix - Optional key prefix filter
   * @returns A SQLStatement containing the FROM and WHERE clauses
   */
  function buildValuesBaseQuery(worldName: string, prefix?: string): SQLStatement {
    const prefixPattern = buildPrefixPattern(prefix)
    return SQL`
      FROM world_storage
      WHERE world_name = ${worldName}
        AND (${prefixPattern}::text IS NULL OR key LIKE ${prefixPattern})`
  }

  return {
    getValue,
    setValue,
    deleteValue,
    deleteAll,
    listValues,
    countKeys
  }
}
