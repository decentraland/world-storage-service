import { Events } from '@dcl/schemas'
import { isRecord, mapSceneEntity } from '../../logic/scene-entity'
import { errorMessageOrDefault } from '../../utils/errors'
import { UPSTREAM_FETCH_OPTIONS, discardResponseBody } from '../../utils/upstreamFetch'
import type { IDeploymentConsumerComponent } from './types'
import type { AppComponents } from '../../types'
import type { WorldScene } from '../worlds-content-server/types'

const GENESIS_WORLD_NAME = 'main'

/**
 * Creates the deployment consumer component: an SQS consumer of worlds-content-server
 * WORLD events and catalyst CATALYST_DEPLOYMENT scene events that keep
 * `scene_logs_access` current.
 *
 * Deployment events carry only the deployed entity id, so the world it belongs to is
 * resolved by fetching the entity itself (content-addressed, so `entityId` is both the
 * lookup key and the content hash) from the configured `WORLDS_CONTENT_SERVER_URL` —
 * never from the event's own (untrusted) `contentServerUrls`. Every event is untrusted
 * ingestion data: shapes are validated with runtime guards (`@dcl/schemas` does not
 * export these Worlds event types as part of its `Event` union), and a malformed or
 * unrecognized payload is logged and skipped rather than thrown.
 *
 * @param components - Required components: config, logs, fetcher, queueConsumer,
 * sceneLogsAccess
 * @returns Promise resolving to IDeploymentConsumerComponent implementation
 */
export async function createDeploymentConsumerComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'fetcher' | 'queueConsumer' | 'sceneLogsAccess'>
): Promise<IDeploymentConsumerComponent> {
  const { config, logs, fetcher, queueConsumer, sceneLogsAccess } = components
  const logger = logs.getLogger('deployment-consumer')

  const worldsContentServerUrl = (await config.requireString('WORLDS_CONTENT_SERVER_URL')).replace(/\/$/, '')

  async function resolveDeployedScene(entityId: string): Promise<{ worldName: string; scene: WorldScene } | null> {
    const url = `${worldsContentServerUrl}/contents/${encodeURIComponent(entityId)}`

    let response: Awaited<ReturnType<typeof fetcher.fetch>>

    try {
      response = await fetcher.fetch(url, UPSTREAM_FETCH_OPTIONS)
    } catch (error) {
      logger.warn('Failed to fetch deployed entity: network error', {
        entityId,
        url,
        error: errorMessageOrDefault(error)
      })
      throw new Error(`Failed to fetch deployed entity ${entityId}: network error`)
    }

    if (!response.ok) {
      await discardResponseBody(response)

      if (response.status >= 500 || response.status === 429) {
        logger.warn('Failed to fetch deployed entity: retryable response', {
          entityId,
          url,
          status: response.status,
          statusText: response.statusText
        })
        throw new Error(`Failed to fetch deployed entity ${entityId}: HTTP ${response.status}`)
      }

      logger.warn('Discarding deployment: deployed entity is not available', {
        entityId,
        url,
        status: response.status,
        statusText: response.statusText
      })
      return null
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      logger.warn('Failed to parse deployed entity response', { entityId, url, error: errorMessageOrDefault(error) })
      return null
    }

    const metadata = isRecord(body) ? body.metadata : undefined
    const worldConfiguration = isRecord(metadata) ? metadata.worldConfiguration : undefined
    const worldName = isRecord(worldConfiguration) ? worldConfiguration.name : undefined

    if (typeof worldName !== 'string' || worldName.length === 0) {
      logger.warn('Deployed entity has no world configuration name', { entityId, url })
      return null
    }

    const scene = mapSceneEntity(body, entityId)
    if (!scene) {
      logger.warn('Deployed entity has an unexpected scene shape', { entityId, url })
      return null
    }

    return { worldName, scene }
  }

  async function handleDeployment(event: unknown): Promise<void> {
    const entity = isRecord(event) ? event.entity : undefined
    const entityId = isRecord(entity) ? entity.entityId : undefined

    if (typeof entityId !== 'string' || entityId.length === 0) {
      logger.warn('Discarding deployment event with missing entityId')
      return
    }

    const resolved = await resolveDeployedScene(entityId)
    if (!resolved) {
      logger.warn('Discarding deployment event: deployed scene is not indexable', { entityId })
      return
    }

    await sceneLogsAccess.upsertForScene({
      worldName: resolved.worldName,
      baseParcel: resolved.scene.base,
      sceneId: resolved.scene.sceneId,
      title: resolved.scene.title,
      realmKind: 'world',
      addresses: resolved.scene.logsPermissions
    })
  }

  async function handleScenesUndeployment(event: unknown): Promise<void> {
    try {
      const metadata = isRecord(event) ? event.metadata : undefined
      const scenes = isRecord(metadata) ? metadata.scenes : undefined

      if (!Array.isArray(scenes)) {
        logger.warn('Skipping world_scenes_undeployment event with missing scenes')
        return
      }

      for (const scene of scenes) {
        const sceneId = isRecord(scene) ? scene.entityId : undefined

        if (typeof sceneId !== 'string' || sceneId.length === 0) {
          logger.warn('Skipping undeployed scene with missing entityId')
          continue
        }

        await sceneLogsAccess.removeScene(sceneId)
      }
    } catch (error) {
      logger.error('Unexpected error handling world_scenes_undeployment event', {
        error: errorMessageOrDefault(error)
      })
    }
  }

  async function handleWorldUndeployment(event: unknown): Promise<void> {
    try {
      const metadata = isRecord(event) ? event.metadata : undefined
      const worldName = isRecord(metadata) ? metadata.worldName : undefined

      if (typeof worldName !== 'string' || worldName.length === 0) {
        logger.warn('Skipping world_undeployment event with missing worldName')
        return
      }

      await sceneLogsAccess.removeByWorld(worldName)
    } catch (error) {
      logger.error('Unexpected error handling world_undeployment event', { error: errorMessageOrDefault(error) })
    }
  }

  async function handleCatalystDeployment(event: unknown): Promise<void> {
    const entity = isRecord(event) ? event.entity : undefined
    const scene = mapSceneEntity(entity)

    if (!scene) {
      logger.warn('Discarding catalyst deployment event with an unexpected scene entity shape')
      return
    }

    await sceneLogsAccess.upsertForScene({
      sceneId: scene.sceneId,
      worldName: GENESIS_WORLD_NAME,
      baseParcel: scene.base,
      title: scene.title,
      realmKind: 'genesis',
      addresses: scene.logsPermissions
    })
  }

  queueConsumer.addMessageHandler(Events.Type.WORLD, Events.SubType.Worlds.DEPLOYMENT, handleDeployment)
  queueConsumer.addMessageHandler(
    Events.Type.WORLD,
    Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT,
    handleScenesUndeployment
  )
  queueConsumer.addMessageHandler(Events.Type.WORLD, Events.SubType.Worlds.WORLD_UNDEPLOYMENT, handleWorldUndeployment)
  queueConsumer.addMessageHandler(
    Events.Type.CATALYST_DEPLOYMENT,
    Events.SubType.CatalystDeployment.SCENE,
    handleCatalystDeployment
  )

  return {}
}
