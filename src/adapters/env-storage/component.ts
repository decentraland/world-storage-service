import { SQL } from 'sql-template-strings'
import type { IEnvStorageComponent } from './types'
import type { AppComponents } from '../../types'

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

  async function setValue(worldName: string, key: string, value: string): Promise<void> {
    logger.debug('Encrypting and storing env variable', { worldName, key })

    const now = new Date().toISOString()
    const encryptedValue = encryption.encrypt(value)
    const query = SQL`
      INSERT INTO env_variables (world_name, key, value_enc, created_at, updated_at)
      VALUES (${worldName}, ${key}, ${encryptedValue}, ${now}, ${now})
      ON CONFLICT (world_name, key) DO
      UPDATE
      SET value_enc = ${encryptedValue}, updated_at = ${now}`
    await pg.query(query)

    logger.debug('Env variable stored successfully', { worldName, key })
  }

  async function deleteValue(worldName: string, key: string): Promise<void> {
    logger.debug('Deleting env variable', { worldName, key })

    const query = SQL`DELETE FROM env_variables WHERE world_name = ${worldName} AND key = ${key}`
    await pg.query(query)

    logger.debug('Env variable deleted successfully', { worldName, key })
  }

  return {
    getValue,
    setValue,
    deleteValue
  }
}
