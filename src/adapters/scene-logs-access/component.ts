import { SQL } from 'sql-template-strings'
import type { ISceneLogsAccessComponent, SceneLogsAccessRow, WatcherScene } from './types'
import type { AppComponents } from '../../types'

/**
 * Creates the scene logs access component: the reverse index of wallets allowed to
 * watch a scene's logs, keyed by (sceneId, address).
 *
 * @param components - Required components: pg (database), logs (logger)
 * @returns ISceneLogsAccessComponent implementation
 */
export const createSceneLogsAccessComponent = async ({
  pg,
  logs
}: Pick<AppComponents, 'pg' | 'logs'>): Promise<ISceneLogsAccessComponent> => {
  const logger = logs.getLogger('scene-logs-access')

  async function upsertForScene(scene: WatcherScene & { addresses: string[] }): Promise<void> {
    const { sceneId, worldName, baseParcel, title, realmKind, addresses } = scene
    const lowercasedAddresses = addresses.map(address => address.toLowerCase())

    logger.debug('Upserting scene logs access', { sceneId, addressCount: lowercasedAddresses.length })

    if (lowercasedAddresses.length === 0) {
      await pg.query(SQL`DELETE FROM scene_logs_access WHERE scene_id = ${sceneId}`)
      return
    }

    await pg.withAsyncContextTransaction(async () => {
      await pg.query(SQL`
        DELETE FROM scene_logs_access
        WHERE scene_id = ${sceneId} AND address <> ALL(${lowercasedAddresses})`)

      await pg.query(SQL`
        INSERT INTO scene_logs_access (scene_id, address, world_name, base_parcel, title, realm_kind, updated_at)
        SELECT ${sceneId}, address, ${worldName}, ${baseParcel}, ${title}, ${realmKind}, current_timestamp
        FROM UNNEST(${lowercasedAddresses}::text[]) AS address
        ON CONFLICT (scene_id, address) DO UPDATE
        SET world_name = ${worldName}, base_parcel = ${baseParcel}, title = ${title}, realm_kind = ${realmKind}, updated_at = current_timestamp`)
    })

    logger.debug('Scene logs access upserted successfully', { sceneId })
  }

  async function touch(row: SceneLogsAccessRow): Promise<void> {
    const { sceneId, address, worldName, baseParcel, title, realmKind } = row
    const lowercasedAddress = address.toLowerCase()

    await pg.query(SQL`
      INSERT INTO scene_logs_access (scene_id, address, world_name, base_parcel, title, realm_kind, updated_at)
      VALUES (${sceneId}, ${lowercasedAddress}, ${worldName}, ${baseParcel}, ${title}, ${realmKind}, current_timestamp)
      ON CONFLICT (scene_id, address) DO NOTHING`)
  }

  async function removeScene(sceneId: string): Promise<void> {
    logger.debug('Removing scene logs access', { sceneId })

    await pg.query(SQL`DELETE FROM scene_logs_access WHERE scene_id = ${sceneId}`)

    logger.debug('Scene logs access removed successfully', { sceneId })
  }

  async function removeByWorld(worldName: string): Promise<void> {
    logger.debug('Removing scene logs access for world', { worldName })

    await pg.query(SQL`DELETE FROM scene_logs_access WHERE world_name = ${worldName}`)

    logger.debug('Scene logs access removed for world successfully', { worldName })
  }

  async function listByAddress(
    address: string,
    limit: number,
    offset: number
  ): Promise<{ data: WatcherScene[]; total: number }> {
    const lowercasedAddress = address.toLowerCase()

    const [countResult, dataResult] = await Promise.all([
      pg.query<{ count: number }>(
        SQL`SELECT COUNT(*)::int as count FROM scene_logs_access WHERE address = ${lowercasedAddress}`
      ),
      pg.query<{
        scene_id: string
        world_name: string
        base_parcel: string
        title: string | null
        realm_kind: 'world' | 'genesis'
      }>(SQL`
        SELECT scene_id, world_name, base_parcel, title, realm_kind
        FROM scene_logs_access
        WHERE address = ${lowercasedAddress}
        ORDER BY updated_at DESC, scene_id ASC
        LIMIT ${limit} OFFSET ${offset}`)
    ])

    const data: WatcherScene[] = dataResult.rows.map(row => ({
      sceneId: row.scene_id,
      worldName: row.world_name,
      baseParcel: row.base_parcel,
      title: row.title,
      realmKind: row.realm_kind
    }))

    return { data, total: countResult.rows[0].count }
  }

  return {
    upsertForScene,
    touch,
    removeScene,
    removeByWorld,
    listByAddress
  }
}
