import { SQL } from 'sql-template-strings'
import type { IPlayerStorageComponent, PlayerStorageItem } from './types'
import type { AppComponents } from '../../types'

export const createPlayerStorageComponent = ({ pg }: Pick<AppComponents, 'pg'>): IPlayerStorageComponent => {
  async function getValue(worldName: string, playerAddress: string, key: string): Promise<unknown | null> {
    const query = SQL`SELECT value FROM player_storage WHERE world_name = ${worldName} AND player_address = ${playerAddress} AND key = ${key}`
    const result = await pg.query<Pick<PlayerStorageItem, 'value'>>(query)
    return result.rows[0]?.value ?? null
  }

  async function setValue(
    worldName: string,
    playerAddress: string,
    key: string,
    value: unknown
  ): Promise<PlayerStorageItem> {
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
    return result.rows[0]
  }

  async function deleteValue(worldName: string, playerAddress: string, key: string): Promise<void> {
    const query = SQL`DELETE FROM player_storage WHERE world_name = ${worldName} AND player_address = ${playerAddress} AND key = ${key}`
    await pg.query(query)
  }

  return {
    getValue,
    setValue,
    deleteValue
  }
}
