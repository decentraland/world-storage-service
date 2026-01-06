import { SQL } from 'sql-template-strings'
import type { IWorldStorageDBComponent, WorldStorageItem } from './types'
import type { AppComponents } from '../../../types'

export const createWorldStorageDBComponent = ({ pg }: Pick<AppComponents, 'pg'>): IWorldStorageDBComponent => {
  async function getValue(worldName: string, key: string): Promise<string | null> {
    const query = SQL`SELECT value FROM world_storage WHERE world_name = ${worldName} AND key = ${key}`
    const result = await pg.query<Pick<WorldStorageItem, 'value'>>(query)
    return result.rows[0]?.value ?? null
  }

  async function setValue(worldName: string, key: string, value: string): Promise<WorldStorageItem> {
    const now = new Date().toISOString()
    const query = SQL`
      INSERT INTO world_storage (world_name, key, value, created_at, updated_at)
      VALUES (${worldName}, ${key}, ${value}, ${now}, ${now})
      ON CONFLICT (world_name, key) DO
      UPDATE
      SET value = ${value}, updated_at = ${now}`
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
