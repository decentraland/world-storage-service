import { isRecord, mapSceneEntity } from '../../logic/scene-entity'
import { errorMessageOrDefault } from '../../utils/errors'
import { UPSTREAM_FETCH_OPTIONS, discardResponseBody } from '../../utils/upstreamFetch'
import type { ICatalystContentComponent } from './types'
import type { AppComponents } from '../../types'
import type { WorldScene } from '../worlds-content-server/types'

/**
 * @param components - Required components: fetcher, config, cache, logs
 * @returns Promise resolving to ICatalystContentComponent implementation
 */
export async function createCatalystContentComponent(
  components: Pick<AppComponents, 'fetcher' | 'config' | 'cache' | 'logs'>
): Promise<ICatalystContentComponent> {
  const { fetcher, config, cache, logs } = components
  const logger = logs.getLogger('catalyst-content')

  const contentUrl = (await config.requireString('CONTENT_URL')).replace(/\/$/, '')
  const cacheTtlSeconds = (await config.getNumber('SCENE_METADATA_CACHE_TTL_SECONDS')) ?? 30

  function entityContainsParcel(entity: unknown, parcel: string): boolean {
    if (!isRecord(entity)) {
      return false
    }

    const scene = isRecord(entity.metadata) && isRecord(entity.metadata.scene) ? entity.metadata.scene : undefined
    const sceneParcels = scene?.parcels
    if (Array.isArray(sceneParcels) && sceneParcels.includes(parcel)) {
      return true
    }

    return Array.isArray(entity.pointers) && entity.pointers.includes(parcel)
  }

  return {
    getActiveSceneEntity: async (parcel: string): Promise<WorldScene | null> => {
      const cacheKey = `catalyst-scene:${parcel}`
      const cached = await cache.get<WorldScene>(cacheKey)
      if (cached) {
        return cached
      }

      const url = `${contentUrl}/entities/active`

      logger.debug('Fetching active scene entity from catalyst content server', { parcel, url })

      let response: Awaited<ReturnType<typeof fetcher.fetch>>

      try {
        response = await fetcher.fetch(url, {
          ...UPSTREAM_FETCH_OPTIONS,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pointers: [parcel] })
        })
      } catch (error) {
        logger.error('Failed to fetch active scene entity: network error', {
          parcel,
          url,
          error: errorMessageOrDefault(error)
        })
        throw new Error(`Failed to fetch active scene entity for parcel ${parcel}: network error`)
      }

      if (!response.ok) {
        await discardResponseBody(response)
        logger.warn('Failed to fetch active scene entity: non-OK response', {
          parcel,
          url,
          status: response.status,
          statusText: response.statusText
        })
        throw new Error(`Failed to fetch active scene entity for parcel ${parcel}`)
      }

      const body: unknown = await response.json()

      if (!Array.isArray(body)) {
        throw new Error(`Catalyst content server returned an unexpected payload for parcel ${parcel}`)
      }

      const activeEntity = body.find(entity => entityContainsParcel(entity, parcel))
      if (!activeEntity) {
        return null
      }

      const scene = mapSceneEntity(activeEntity)
      if (!scene) {
        throw new Error(`Catalyst content server returned an entity with an unexpected shape for parcel ${parcel}`)
      }

      await cache.set(cacheKey, scene, cacheTtlSeconds)

      return scene
    }
  }
}
