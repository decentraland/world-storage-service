import { Events } from '@dcl/schemas'
import {
  originOf,
  parseAllowedWorldsContentServerHosts,
  requireOrigin,
  resolveSourceContentServerUrl
} from '../../utils/contentServerAllowlist'
import { errorMessageOrDefault } from '../../utils/errors'
import { isRecord, pickString } from '../../utils/typeGuards'
import {
  ALLOWLISTED_SOURCE_FETCH_OPTIONS,
  UPSTREAM_FETCH_OPTIONS,
  discardResponseBody
} from '../../utils/upstreamFetch'
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
 * A world event's source server is its `sourceContentServerUrl` message attribute: absent or
 * equal to the `WORLDS_CONTENT_SERVER_URL` origin = the default server (stored NULL); otherwise
 * it must be a bare HTTPS origin whose host is on `ALLOWED_WORLDS_CONTENT_SERVER_HOSTS`, or the
 * event is dropped (treating it as the default server would let it write or remove the
 * default server's rows). A deployment whose `contentServerUrls[0]` origin differs from the
 * attribute is dropped too. Deployment events carry only the entity id, so the scene is
 * fetched from the source server; a non-allowlisted host is never fetched.
 *
 * Every event is untrusted ingestion data: shapes are validated with runtime guards
 * (`@dcl/schemas` does not export these Worlds event types as part of its `Event` union), and
 * a malformed or unrecognized payload is logged and skipped rather than thrown.
 *
 * @param components - Required components: config, logs, metrics, fetcher, queueConsumer,
 * sceneCollaborators, sceneEntity, worldSources
 * @returns Promise resolving to IDeploymentConsumerComponent implementation
 */
export async function createDeploymentConsumerComponent(
  components: Pick<
    AppComponents,
    'config' | 'logs' | 'metrics' | 'fetcher' | 'queueConsumer' | 'sceneCollaborators' | 'sceneEntity' | 'worldSources'
  >
): Promise<IDeploymentConsumerComponent> {
  const { config, logs, metrics, fetcher, queueConsumer, sceneCollaborators, sceneEntity, worldSources } = components
  const logger = logs.getLogger('deployment-consumer')

  const worldsContentServerUrl = (await config.requireString('WORLDS_CONTENT_SERVER_URL')).replace(/\/$/, '')
  const defaultOrigin = requireOrigin(worldsContentServerUrl)
  const contentUrl = (await config.requireString('CONTENT_URL')).replace(/\/$/, '')
  const allowedWorldsContentServerHosts = parseAllowedWorldsContentServerHosts(
    await config.getString('ALLOWED_WORLDS_CONTENT_SERVER_HOSTS')
  )

  function dropEvent(subType: string, reason: string, context: Record<string, string>): undefined {
    logger.error('Dropping world event: source server is not accepted', { subType, reason, ...context })
    metrics.increment('world_storage_world_events_dropped_total', { sub_type: subType, reason })
    return undefined
  }

  /**
   * @returns The event's source (null = default server) and its origin, or undefined when the
   * event must be dropped.
   */
  function resolveEventSource(event: unknown, subType: string): { origin: string; source: string | null } | undefined {
    const { sourceContentServerUrl } = readMessageAttributes(event)
    if (sourceContentServerUrl === undefined) {
      return { origin: defaultOrigin, source: null }
    }

    const resolution = resolveSourceContentServerUrl(
      sourceContentServerUrl,
      allowedWorldsContentServerHosts,
      defaultOrigin
    )
    if ('reason' in resolution) {
      return dropEvent(subType, resolution.reason, {
        sourceContentServerUrl: sourceContentServerUrl.slice(0, 200)
      })
    }
    return { origin: resolution.origin, source: resolution.source }
  }

  /**
   * @returns The deployment's source (null = default server), or undefined when it must be
   * dropped. With the attribute present, the body's `contentServerUrls[0]` must share its origin.
   */
  function resolveDeploymentSource(event: unknown, entityId: string): { source: string | null } | undefined {
    const subType = Events.SubType.Worlds.DEPLOYMENT
    const resolved = resolveEventSource(event, subType)
    if (!resolved || readMessageAttributes(event).sourceContentServerUrl === undefined) {
      return resolved
    }

    const contentServerUrls = isRecord(event) ? event.contentServerUrls : undefined
    const declaredUrl = Array.isArray(contentServerUrls) ? contentServerUrls[0] : undefined
    if (originOf(declaredUrl) !== resolved.origin) {
      return dropEvent(subType, 'source_mismatch', {
        entityId,
        sourceContentServerUrl: resolved.origin,
        declaredUrl: String(declaredUrl).slice(0, 200)
      })
    }
    return resolved
  }

  async function fetchEntityBody(baseUrl: string, entityId: string, isDefaultSource = true): Promise<unknown> {
    const url = `${baseUrl}/contents/${encodeURIComponent(entityId)}`

    let response: Awaited<ReturnType<typeof fetcher.fetch>>

    try {
      response = await fetcher.fetch(url, isDefaultSource ? UPSTREAM_FETCH_OPTIONS : ALLOWLISTED_SOURCE_FETCH_OPTIONS)
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
    source: string | null,
    entityId: string
  ): Promise<{ worldName: string; scene: WorldScene } | null> {
    const body = await fetchEntityBody(source ?? worldsContentServerUrl, entityId, source === null)
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

    const eventSource = resolveDeploymentSource(event, entityId)
    if (!eventSource) {
      return
    }
    const sourceContentServerUrl = eventSource.source

    const resolved = await resolveDeployedScene(sourceContentServerUrl, entityId)
    if (!resolved) {
      logger.warn('Discarding deployment event: deployed scene is not indexable', { entityId })
      return
    }

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

    const resolved = resolveEventSource(event, Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT)
    if (!resolved) {
      return
    }
    const { source } = resolved

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

    const resolved = resolveEventSource(event, Events.SubType.Worlds.WORLD_UNDEPLOYMENT)
    if (!resolved) {
      return
    }
    const { source } = resolved

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
