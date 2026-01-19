import { SQL } from 'sql-template-strings'
import type { IPlayerStorageComponent, PlayerStorageItem } from './types'
import type { AppComponents } from '../../types'

/**
 * Creates the player storage component that manages player-level key-value storage within worlds.
 *
 * @param components - Required components: pg (database), logs (logger)
 * @returns IPlayerStorageComponent implementation
 */
export const createPlayerStorageComponent = ({
  pg,
  logs
}: Pick<AppComponents, 'pg' | 'logs'>): IPlayerStorageComponent => {
  const logger = logs.getLogger('player-storage')

  async function getValue(worldName: string, playerAddress: string, key: string): Promise<unknown | null> {
    logger.debug('Fetching player storage value', { worldName, playerAddress, key })

    const query = SQL`SELECT value FROM player_storage WHERE world_name = ${worldName} AND player_address = ${playerAddress} AND key = ${key}`
    const result = await pg.query<Pick<PlayerStorageItem, 'value'>>(query)
    const value = result.rows[0]?.value ?? null

    if (value === null) {
      logger.debug('Player storage value not found', { worldName, playerAddress, key })
    } else {
      logger.debug('Player storage value retrieved successfully', { worldName, playerAddress, key })
    }

    return value
  }

  async function setValue(
    worldName: string,
    playerAddress: string,
    key: string,
    value: unknown
  ): Promise<PlayerStorageItem> {
    logger.debug('Setting player storage value', { worldName, playerAddress, key })

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

    logger.debug('Player storage value set successfully', { worldName, playerAddress, key })

    return result.rows[0]
  }

  async function deleteValue(worldName: string, playerAddress: string, key: string): Promise<void> {
    logger.debug('Deleting player storage value', { worldName, playerAddress, key })

    const query = SQL`DELETE FROM player_storage WHERE world_name = ${worldName} AND player_address = ${playerAddress} AND key = ${key}`
    await pg.query(query)

    logger.debug('Player storage value deleted successfully', { worldName, playerAddress, key })
  }

  return {
    getValue,
    setValue,
    deleteValue
  }
}
