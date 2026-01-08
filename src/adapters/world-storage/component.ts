import { SQL } from 'sql-template-strings'
import type { IWorldStorageComponent, WorldStorageItem } from './types'
import type { AppComponents } from '../../types'

export const createWorldStorageComponent = ({ pg }: Pick<AppComponents, 'pg'>): IWorldStorageComponent => {
  async function getValue(worldName: string, key: string): Promise<unknown | null> {
    const query = SQL`SELECT value FROM world_storage WHERE world_name = ${worldName} AND key = ${key}`
    const result = await pg.query<Pick<WorldStorageItem, 'value'>>(query)
    return result.rows[0]?.value ?? null
  }

  async function setValue(worldName: string, key: string, value: unknown): Promise<WorldStorageItem> {
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
    return result.rows[0]
  }

  async function deleteValue(worldName: string, key: string): Promise<void> {
    const query = SQL`DELETE FROM world_storage WHERE world_name = ${worldName} AND key = ${key}`
    await pg.query(query)
  }

  return {
    getValue,
    setValue,
    deleteValue
  }
}
