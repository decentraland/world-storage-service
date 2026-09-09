import { Events } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../utils/errors'
import { UPSTREAM_FETCH_OPTIONS, discardResponseBody } from '../../utils/upstreamFetch'
import type { IDeploymentConsumerComponent } from './types'
import type { AppComponents } from '../../types'
import type { WorldScene } from '../worlds-content-server/types'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null
}

/**
 * Creates the deployment consumer component: a long-lived SQS consumer of
 * worlds-content-server deployment/undeployment SNS events that keeps
 * `scene_logs_access` current for Worlds scenes.
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
 * worldsContentServer, sceneLogsAccess
 * @returns Promise resolving to IDeploymentConsumerComponent implementation
 */
export async function createDeploymentConsumerComponent(
  components: Pick<
    AppComponents,
    'config' | 'logs' | 'fetcher' | 'queueConsumer' | 'worldsContentServer' | 'sceneLogsAccess'
  >
): Promise<IDeploymentConsumerComponent> {
  const { config, logs, fetcher, queueConsumer, worldsContentServer, sceneLogsAccess } = components
  const logger = logs.getLogger('deployment-consumer')

  const worldsContentServerUrl = (await config.requireString('WORLDS_CONTENT_SERVER_URL')).replace(/\/$/, '')

  async function resolveWorldName(entityId: string): Promise<string | null> {
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
      return null
    }

    if (!response.ok) {
      await discardResponseBody(response)
      logger.warn('Failed to fetch deployed entity: non-OK response', {
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

    return worldName
  }

  async function handleDeployment(event: unknown): Promise<void> {
    try {
      const entity = isRecord(event) ? event.entity : undefined
      const entityId = isRecord(entity) ? entity.entityId : undefined

      if (typeof entityId !== 'string' || entityId.length === 0) {
        logger.warn('Skipping deployment event with missing entityId')
        return
      }

      const worldName = await resolveWorldName(entityId)
      if (!worldName) {
        logger.warn('Skipping deployment event: could not resolve world name', { entityId })
        return
      }

      let scenes: WorldScene[]
      try {
        scenes = await worldsContentServer.getScenes(worldName)
      } catch (error) {
        logger.error('Failed to fetch world scenes for deployment event', {
          worldName,
          entityId,
          error: errorMessageOrDefault(error)
        })
        return
      }

      const scene = scenes.find(candidate => candidate.sceneId === entityId)
      if (!scene) {
        logger.warn('Skipping deployment event: deployed scene not found among world scenes', {
          worldName,
          entityId
        })
        return
      }

      await sceneLogsAccess.upsertForScene({
        worldName,
        baseParcel: scene.base,
        sceneId: scene.sceneId,
        title: scene.title,
        realmKind: 'world',
        addresses: scene.logsPermissions
      })
    } catch (error) {
      logger.error('Unexpected error handling deployment event', { error: errorMessageOrDefault(error) })
    }
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

      let scenes: WorldScene[]
      try {
        scenes = await worldsContentServer.getScenes(worldName)
      } catch (error) {
        logger.warn(
          'Could not enumerate scenes for undeployed world; matching scene_logs_access rows may remain stale',
          {
            worldName,
            error: errorMessageOrDefault(error)
          }
        )
        return
      }

      for (const scene of scenes) {
        await sceneLogsAccess.removeScene(scene.sceneId)
      }
    } catch (error) {
      logger.error('Unexpected error handling world_undeployment event', { error: errorMessageOrDefault(error) })
    }
  }

  queueConsumer.addMessageHandler(Events.Type.WORLD, Events.SubType.Worlds.DEPLOYMENT, handleDeployment)
  queueConsumer.addMessageHandler(
    Events.Type.WORLD,
    Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT,
    handleScenesUndeployment
  )
  queueConsumer.addMessageHandler(Events.Type.WORLD, Events.SubType.Worlds.WORLD_UNDEPLOYMENT, handleWorldUndeployment)

  return {}
}
