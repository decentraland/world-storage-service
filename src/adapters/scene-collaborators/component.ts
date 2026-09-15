import { SQL } from 'sql-template-strings'
import type { CollaboratorScene, ISceneCollaboratorsComponent, SceneCollaboratorsRow } from './types'
import type { AppComponents } from '../../types'

/**
 * Creates the scene collaborators component: the reverse index of a scene's collaborators,
 * keyed by (sceneId, address). A collaborator is a wallet in the scene's `logsPermissions`
 * (the only grant source at this time), which authorizes read/write/delete on the scene's
 * storage.
 *
 * @param components - Required components: pg (database), logs (logger)
 * @returns ISceneCollaboratorsComponent implementation
 */
export const createSceneCollaboratorsComponent = async ({
  pg,
  logs
}: Pick<AppComponents, 'pg' | 'logs'>): Promise<ISceneCollaboratorsComponent> => {
  const logger = logs.getLogger('scene-collaborators')

  async function upsertForScene(scene: CollaboratorScene & { addresses: string[]; deployedAt: number }): Promise<void> {
    const { sceneId, worldName, baseParcel, title, realmKind, addresses, deployedAt } = scene
    const normalizedAddresses = [...new Set(addresses.map(address => address.toLowerCase()))]

    logger.debug('Upserting scene collaborators', { sceneId, addressCount: normalizedAddresses.length })

    await pg.withAsyncContextTransaction(async () => {
      const newest = await pg.query<{ max_deployed_at: string | null }>(SQL`
        SELECT MAX(deployed_at) AS max_deployed_at FROM scene_collaborators
        WHERE world_name = ${worldName} AND base_parcel = ${baseParcel}`)
      if (Number(newest.rows[0]?.max_deployed_at ?? 0) > deployedAt) {
        logger.debug('Skipping stale deployment; a newer one is already indexed at this location', {
          sceneId,
          deployedAt
        })
        return
      }

      if (normalizedAddresses.length === 0) {
        await pg.query(SQL`
          DELETE FROM scene_collaborators WHERE world_name = ${worldName} AND base_parcel = ${baseParcel}`)
        return
      }

      await pg.query(SQL`
        DELETE FROM scene_collaborators
        WHERE world_name = ${worldName} AND base_parcel = ${baseParcel} AND scene_id <> ${sceneId}`)

      await pg.query(SQL`
        DELETE FROM scene_collaborators
        WHERE scene_id = ${sceneId} AND address <> ALL(${normalizedAddresses})`)

      await pg.query(SQL`
        INSERT INTO scene_collaborators (scene_id, address, world_name, base_parcel, title, realm_kind, deployed_at, updated_at)
        SELECT ${sceneId}, address, ${worldName}, ${baseParcel}, ${title}, ${realmKind}, ${deployedAt}, current_timestamp
        FROM UNNEST(${normalizedAddresses}::text[]) AS address
        ON CONFLICT (scene_id, address) DO UPDATE
        SET world_name = ${worldName}, base_parcel = ${baseParcel}, title = ${title}, realm_kind = ${realmKind}, deployed_at = ${deployedAt}, updated_at = current_timestamp`)
    })

    logger.debug('Scene collaborators upserted successfully', { sceneId })
  }

  async function touch(row: SceneCollaboratorsRow): Promise<void> {
    const { sceneId, address, worldName, baseParcel, title, realmKind, deployedAt } = row
    const lowercasedAddress = address.toLowerCase()

    await pg.query(SQL`
      INSERT INTO scene_collaborators (scene_id, address, world_name, base_parcel, title, realm_kind, deployed_at, updated_at)
      VALUES (${sceneId}, ${lowercasedAddress}, ${worldName}, ${baseParcel}, ${title}, ${realmKind}, ${deployedAt}, current_timestamp)
      ON CONFLICT (scene_id, address) DO NOTHING`)
  }

  async function removeScene(sceneId: string): Promise<void> {
    logger.debug('Removing scene collaborators', { sceneId })

    await pg.query(SQL`DELETE FROM scene_collaborators WHERE scene_id = ${sceneId}`)

    logger.debug('Scene collaborators removed successfully', { sceneId })
  }

  async function removeByWorld(worldName: string): Promise<void> {
    logger.debug('Removing scene collaborators for world', { worldName })

    await pg.query(SQL`DELETE FROM scene_collaborators WHERE world_name = ${worldName}`)

    logger.debug('Scene collaborators removed for world successfully', { worldName })
  }

  async function listByAddress(
    address: string,
    limit: number,
    offset: number
  ): Promise<{ data: CollaboratorScene[]; total: number }> {
    const lowercasedAddress = address.toLowerCase()

    const [countResult, dataResult] = await Promise.all([
      pg.query<{ count: number }>(
        SQL`SELECT COUNT(*)::int as count FROM scene_collaborators WHERE address = ${lowercasedAddress}`
      ),
      pg.query<{
        scene_id: string
        world_name: string
        base_parcel: string
        title: string | null
        realm_kind: 'world' | 'genesis'
      }>(SQL`
        SELECT scene_id, world_name, base_parcel, title, realm_kind
        FROM scene_collaborators
        WHERE address = ${lowercasedAddress}
        ORDER BY updated_at DESC, scene_id ASC
        LIMIT ${limit} OFFSET ${offset}`)
    ])

    const data: CollaboratorScene[] = dataResult.rows.map(row => ({
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
