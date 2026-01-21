import { SQL } from 'sql-template-strings'
import type { IWorldStorageComponent, WorldStorageItem } from './types'
import type { AppComponents } from '../../types'

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

  async function deleteValue(worldName: string, key: string): Promise<void> {
    logger.debug('Deleting world storage value', { worldName, key })

    const query = SQL`DELETE FROM world_storage WHERE world_name = ${worldName} AND key = ${key}`
    await pg.query(query)

    logger.debug('World storage value deleted successfully', { worldName, key })
  }

  async function deleteAll(worldName: string): Promise<void> {
    logger.debug('Deleting all world storage values', { worldName })

    const query = SQL`DELETE FROM world_storage WHERE world_name = ${worldName}`
    await pg.query(query)

    logger.debug('All world storage values deleted successfully', { worldName })
  }

  return {
    getValue,
    setValue,
    deleteValue,
    deleteAll
  }
}
