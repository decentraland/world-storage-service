import { SQL } from 'sql-template-strings'
import type { IEnvStorageComponent } from './types'
import type { AppComponents } from '../../types'

export const createEnvStorageComponent = ({
  pg,
  encryption
}: Pick<AppComponents, 'pg' | 'encryption'>): IEnvStorageComponent => {
  async function getValue(worldName: string, key: string): Promise<string | null> {
    const query = SQL`SELECT value_enc FROM env_variables WHERE world_name = ${worldName} AND key = ${key}`
    const result = await pg.query<{ value_enc: Buffer }>(query)
    if (!result.rows[0]?.value_enc) {
      return null
    }
    return encryption.decrypt(result.rows[0].value_enc)
  }

  async function setValue(worldName: string, key: string, value: string): Promise<void> {
    const now = new Date().toISOString()
    const encryptedValue = encryption.encrypt(value)
    const query = SQL`
      INSERT INTO env_variables (world_name, key, value_enc, created_at, updated_at)
      VALUES (${worldName}, ${key}, ${encryptedValue}, ${now}, ${now})
      ON CONFLICT (world_name, key) DO
      UPDATE
      SET value_enc = ${encryptedValue}, updated_at = ${now}`
    await pg.query(query)
  }

  async function deleteValue(worldName: string, key: string): Promise<void> {
    const query = SQL`DELETE FROM env_variables WHERE world_name = ${worldName} AND key = ${key}`
    await pg.query(query)
  }

  return {
    getValue,
    setValue,
    deleteValue
  }
}
