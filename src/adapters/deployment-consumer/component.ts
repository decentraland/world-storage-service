import { Events } from '@dcl/schemas'
import {
  parseAllowedContentServerHosts,
  resolveAllowedContentServerUrl,
  resolveSourceContentServerUrl,
  toSourceContentServerUrl
} from '../../utils/contentServerAllowlist'
import { errorMessageOrDefault } from '../../utils/errors'
import { isRecord, pickString } from '../../utils/typeGuards'
import { UPSTREAM_FETCH_OPTIONS, discardResponseBody } from '../../utils/upstreamFetch'
import { readMessageAttributes } from '../sqs-queue/component'
import type { IDeploymentConsumerComponent } from './types'
import type { AppComponents } from '../../types'
import type { WorldScene } from '../worlds-content-server/types'

const GENESIS_WORLD_NAME = 'main'

/**
 * Creates the deployment consumer component: an SQS consumer of worlds-content-server
 * WORLD events and catalyst CATALYST_DEPLOYMENT scene events that keep
 * `scene_collaborators` current.
 *
 * Deployment events carry only the deployed entity id, so the world it belongs to is
 * resolved by fetching the entity itself (content-addressed, so `entityId` is both the
 * lookup key and the content hash) from the server that published it: the event's
 * (untrusted) `contentServerUrls[0]` when it is HTTPS and its host is exactly on
 * `ALLOWED_CONTENT_SERVER_HOSTS`, else the configured `WORLDS_CONTENT_SERVER_URL`. A
 * non-allowlisted host is never fetched. The rows and the world's source are recorded with
 * that server (NULL = the default server).
 *
 * Undeployment events only remove rows of the server that sent them, named by the
 * `sourceContentServerUrl` message attribute: absent = the default server; present but not
 * an allowlisted HTTPS URL = the message is dropped (treating it as the default server would
 * let it remove the default server's rows). Every event is untrusted
 * ingestion data: shapes are validated with runtime guards (`@dcl/schemas` does not
 * export these Worlds event types as part of its `Event` union), and a malformed or
 * unrecognized payload is logged and skipped rather than thrown.
 *
 * @param components - Required components: config, logs, fetcher, queueConsumer,
 * sceneCollaborators, sceneEntity, worldSources
 * @returns Promise resolving to IDeploymentConsumerComponent implementation
 */
export async function createDeploymentConsumerComponent(
  components: Pick<
    AppComponents,
    'config' | 'logs' | 'fetcher' | 'queueConsumer' | 'sceneCollaborators' | 'sceneEntity' | 'worldSources'
  >
): Promise<IDeploymentConsumerComponent> {
  const { config, logs, fetcher, queueConsumer, sceneCollaborators, sceneEntity, worldSources } = components
  const logger = logs.getLogger('deployment-consumer')

  const worldsContentServerUrl = (await config.requireString('WORLDS_CONTENT_SERVER_URL')).replace(/\/$/, '')
  const contentUrl = (await config.requireString('CONTENT_URL')).replace(/\/$/, '')
  const allowedContentServerHosts = parseAllowedContentServerHosts(
    await config.getString('ALLOWED_CONTENT_SERVER_HOSTS')
  )

  /**
   * @returns The source of an undeployment event (null = default server), or undefined when
   * its `sourceContentServerUrl` attribute is not allowed and the event must be dropped.
   */
  function resolveUndeploymentSource(event: unknown, subType: string): string | null | undefined {
    const { sourceContentServerUrl } = readMessageAttributes(event)
    const resolution = resolveSourceContentServerUrl(
      sourceContentServerUrl,
      allowedContentServerHosts,
      worldsContentServerUrl
    )
    if (!resolution.ok) {
      logger.warn('Dropping undeployment: sourceContentServerUrl is not an allowed content server', {
        subType,
        sourceContentServerUrl: String(sourceContentServerUrl).slice(0, 200)
      })
      return undefined
    }
    return resolution.source
  }

  function resolveWorldsSourceUrl(event: unknown, entityId: string): string {
    const contentServerUrls = isRecord(event) ? event.contentServerUrls : undefined
    const declaredUrl = Array.isArray(contentServerUrls) ? contentServerUrls[0] : undefined
    if (declaredUrl === undefined) {
      return worldsContentServerUrl
    }

    const allowedUrl = resolveAllowedContentServerUrl(declaredUrl, allowedContentServerHosts)
    if (!allowedUrl) {
      logger.warn('Deployment source server is not allowlisted, using the configured worlds content server', {
        entityId,
        declaredUrl: String(declaredUrl).slice(0, 200)
      })
      return worldsContentServerUrl
    }

    return allowedUrl
  }

  async function fetchEntityBody(baseUrl: string, entityId: string): Promise<unknown> {
    const url = `${baseUrl}/contents/${encodeURIComponent(entityId)}`

    let response: Awaited<ReturnType<typeof fetcher.fetch>>

    try {
      response = await fetcher.fetch(url, UPSTREAM_FETCH_OPTIONS)
    } catch (error) {
      logger.warn('Discarding deployment: network error fetching deployed entity', {
        entityId,
        url,
        error: errorMessageOrDefault(error)
      })
      return null
    }

    if (!response.ok) {
      await discardResponseBody(response)

      logger.warn('Discarding deployment: deployed entity is not available', {
        entityId,
        url,
        status: response.status,
        statusText: response.statusText
      })
      return null
    }

    try {
      return await response.json()
    } catch (error) {
      logger.warn('Failed to parse deployed entity response', { entityId, url, error: errorMessageOrDefault(error) })
      return null
    }
  }

  async function resolveDeployedScene(
    sourceUrl: string,
    entityId: string
  ): Promise<{ worldName: string; scene: WorldScene } | null> {
    const body = await fetchEntityBody(sourceUrl, entityId)
    if (!body) {
      return null
    }

    const metadata = isRecord(body) ? body.metadata : undefined
    const worldConfiguration = isRecord(metadata) ? metadata.worldConfiguration : undefined
    const worldName = isRecord(worldConfiguration) ? worldConfiguration.name : undefined

    if (typeof worldName !== 'string' || worldName.length === 0) {
      logger.warn('Deployed entity has no world configuration name', { entityId })
      return null
    }

    const scene = sceneEntity.mapSceneEntity(body, entityId)
    if (!scene) {
      logger.warn('Deployed entity has an unexpected scene shape', { entityId })
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

    const sourceUrl = resolveWorldsSourceUrl(event, entityId)
    const resolved = await resolveDeployedScene(sourceUrl, entityId)
    if (!resolved) {
      logger.warn('Discarding deployment event: deployed scene is not indexable', { entityId })
      return
    }

    const sourceContentServerUrl = toSourceContentServerUrl(sourceUrl, worldsContentServerUrl)

    await sceneCollaborators.upsertForScene({
      worldName: resolved.worldName,
      baseParcel: resolved.scene.base,
      sceneId: resolved.scene.sceneId,
      title: resolved.scene.title,
      realmKind: 'world',
      deployedAt: resolved.scene.deployedAt,
      addresses: resolved.scene.logsPermissions,
      sourceContentServerUrl
    })
    await worldSources.recordDeployment(resolved.worldName, sourceContentServerUrl, resolved.scene.deployedAt)
  }

  async function handleScenesUndeployment(event: unknown): Promise<void> {
    const metadata = isRecord(event) ? event.metadata : undefined
    const scenes = isRecord(metadata) ? metadata.scenes : undefined

    if (!Array.isArray(scenes)) {
      logger.warn('Discarding world_scenes_undeployment event with missing scenes')
      return
    }

    const source = resolveUndeploymentSource(event, Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT)
    if (source === undefined) {
      return
    }

    for (const scene of scenes) {
      const sceneId = isRecord(scene) ? scene.entityId : undefined

      if (typeof sceneId !== 'string' || sceneId.length === 0) {
        logger.warn('Skipping undeployed scene with missing entityId')
        continue
      }

      await sceneCollaborators.removeByScene(sceneId, source)
    }
  }

  async function handleWorldUndeployment(event: unknown): Promise<void> {
    const metadata = isRecord(event) ? event.metadata : undefined
    const worldName = isRecord(metadata) ? metadata.worldName : undefined

    if (typeof worldName !== 'string' || worldName.length === 0) {
      logger.warn('Discarding world_undeployment event with missing worldName')
      return
    }

    const source = resolveUndeploymentSource(event, Events.SubType.Worlds.WORLD_UNDEPLOYMENT)
    if (source === undefined) {
      return
    }

    await sceneCollaborators.removeByWorld(worldName, source)
    await worldSources.removeIfSource(worldName, source)
  }

  async function handleCatalystDeployment(event: unknown): Promise<void> {
    const entity = isRecord(event) ? event.entity : undefined
    const entityId = pickString(
      isRecord(entity) ? entity.entityId : undefined,
      isRecord(entity) ? entity.id : undefined,
      isRecord(event) ? event.key : undefined
    )

    if (!entityId) {
      logger.warn('Discarding catalyst deployment event with no resolvable entity id')
      return
    }

    const scene =
      sceneEntity.mapSceneEntity(entity, entityId) ??
      sceneEntity.mapSceneEntity(await fetchEntityBody(contentUrl, entityId), entityId)

    if (!scene) {
      logger.warn('Discarding catalyst deployment event with an unexpected scene entity shape', { entityId })
      return
    }

    const eventTimestamp = isRecord(event) && typeof event.timestamp === 'number' ? event.timestamp : 0

    await sceneCollaborators.upsertForScene({
      sceneId: scene.sceneId,
      worldName: GENESIS_WORLD_NAME,
      baseParcel: scene.base,
      title: scene.title,
      realmKind: 'genesis',
      deployedAt: scene.deployedAt || eventTimestamp,
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
