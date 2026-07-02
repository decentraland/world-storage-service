import { errorMessageOrDefault } from '../../utils/errors'
import { UPSTREAM_FETCH_OPTIONS } from '../../utils/upstreamFetch'
import type { IWorldsContentServerComponent, WorldPermissions } from './types'
import type { AppComponents } from '../../types'

/**
 * Creates the worlds content server component for fetching world permissions.
 *
 * This component communicates with an external worlds content server to retrieve
 * permission information for worlds. Results are cached in memory with a short TTL
 * (`WORLD_PERMISSIONS_CACHE_TTL_SECONDS`, default 30 seconds): every authenticated
 * request performs a permission check, and without the cache each one is a synchronous
 * upstream round-trip. The TTL also bounds how long a revoked permission keeps working,
 * so it is deliberately short.
 *
 * @param components - Required components: fetcher, config, cache, logs
 * @returns Promise resolving to IWorldsContentServerComponent implementation
 */
export async function createWorldsContentServerComponent(
  components: Pick<AppComponents, 'fetcher' | 'config' | 'cache' | 'logs'>
): Promise<IWorldsContentServerComponent> {
  const { fetcher, config, cache, logs } = components
  const logger = logs.getLogger('worlds-content-server')

  const worldsContentServerUrl = await config.requireString('WORLDS_CONTENT_SERVER_URL')
  const cacheTtlSeconds = (await config.getNumber('WORLD_PERMISSIONS_CACHE_TTL_SECONDS')) ?? 30

  /**
   * Validates the minimal shape the permission checks rely on, so a malformed upstream
   * payload fails here with a clear error instead of a TypeError (or worse, a payload
   * missing `wallets` being treated as an empty allow-list).
   */
  function assertWorldPermissionsShape(body: unknown, worldName: string): asserts body is WorldPermissions {
    const permissions = (body as WorldPermissions | null)?.permissions
    const deployment = permissions?.deployment
    const isValid =
      typeof deployment?.type === 'string' && (deployment.type !== 'allow-list' || Array.isArray(deployment.wallets))

    if (!isValid) {
      throw new Error(`Worlds content server returned an unexpected permissions payload for ${worldName}`)
    }
  }

  return {
    getPermissions: async (worldName: string): Promise<WorldPermissions> => {
      const cacheKey = `world-permissions:${worldName}`
      const cached = await cache.get<WorldPermissions>(cacheKey)
      if (cached) {
        return cached
      }

      const url = `${worldsContentServerUrl}/world/${encodeURIComponent(worldName)}/permissions`

      logger.debug('Fetching world permissions from content server', {
        worldName,
        url
      })

      let response: Awaited<ReturnType<typeof fetcher.fetch>>

      try {
        response = await fetcher.fetch(url, UPSTREAM_FETCH_OPTIONS)
      } catch (error) {
        logger.error('Failed to fetch world permissions: network error', {
          worldName,
          url,
          error: errorMessageOrDefault(error)
        })
        throw new Error(`Failed to fetch world permissions for ${worldName}: network error`)
      }

      if (!response.ok) {
        logger.warn('Failed to fetch world permissions: non-OK response', {
          worldName,
          url,
          status: response.status,
          statusText: response.statusText
        })
        throw new Error(`Failed to fetch world permissions for ${worldName}`)
      }

      logger.debug('World permissions fetched successfully', {
        worldName,
        status: response.status
      })

      const body: unknown = await response.json()
      assertWorldPermissionsShape(body, worldName)

      await cache.set(cacheKey, body, cacheTtlSeconds)

      return body
    }
  }
}
