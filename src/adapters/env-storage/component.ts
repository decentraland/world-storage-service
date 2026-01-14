import { SQL } from 'sql-template-strings'
import type { EnvStorageItem, IEnvStorageComponent } from './types'
import type { AppComponents } from '../../types'

export const createEnvStorageComponent = ({ pg }: Pick<AppComponents, 'pg'>): IEnvStorageComponent => {
  async function getValue(worldName: string, key: string): Promise<string | null> {
    const query = SQL`SELECT value_enc FROM env_variables WHERE world_name = ${worldName} AND key = ${key}`
    const result = await pg.query<{ value_enc: Buffer }>(query)
    if (!result.rows[0]?.value_enc) {
      return null
    }
    // TODO: Decrypt value using encryption component
    return result.rows[0].value_enc.toString('utf8')
  }

  async function setValue(worldName: string, key: string, value: string): Promise<EnvStorageItem> {
    const now = new Date().toISOString()
    // TODO: Encrypt value using encryption component
    const valueBuffer = Buffer.from(value, 'utf8')
    const query = SQL`
      INSERT INTO env_variables (world_name, key, value_enc, created_at, updated_at)
      VALUES (${worldName}, ${key}, ${valueBuffer}, ${now}, ${now})
      ON CONFLICT (world_name, key) DO
      UPDATE
      SET value_enc = ${valueBuffer}, updated_at = ${now}
      RETURNING world_name as "worldName", key, value_enc as "valueEnc"`
    const result = await pg.query<{ worldName: string; key: string; valueEnc: Buffer }>(query)
    return {
      worldName: result.rows[0].worldName,
      key: result.rows[0].key,
      // TODO: Decrypt value using encryption component
      value: result.rows[0].valueEnc.toString('utf8')
    }
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
