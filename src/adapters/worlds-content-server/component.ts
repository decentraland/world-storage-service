import { errorMessageOrDefault } from '../../utils/errors'
import type { IWorldsContentServerComponent, WorldPermissions } from './types'
import type { AppComponents } from '../../types'

/**
 * Creates the worlds content server component for fetching world permissions.
 *
 * This component communicates with an external worlds content server to retrieve
 * permission information for worlds. All external calls are logged for debugging.
 *
 * @param components - Required components: fetcher, config, logs
 * @returns Promise resolving to IWorldsContentServerComponent implementation
 */
// TODO: Add a cache layer to the component to avoid making unnecessary requests to the worlds content server.
export async function createWorldsContentServerComponent(
  components: Pick<AppComponents, 'fetcher' | 'config' | 'logs'>
): Promise<IWorldsContentServerComponent> {
  const { fetcher, config, logs } = components
  const logger = logs.getLogger('worlds-content-server')

  const worldsContentServerUrl = await config.requireString('WORLDS_CONTENT_SERVER_URL')

  logger.info('Worlds content server component initialized', {
    serverUrl: worldsContentServerUrl
  })

  return {
    getPermissions: async (worldName: string): Promise<WorldPermissions> => {
      const url = `${worldsContentServerUrl}/world/${encodeURIComponent(worldName)}/permissions`

      logger.debug('Fetching world permissions from content server', {
        worldName,
        url
      })

      let response: Awaited<ReturnType<typeof fetcher.fetch>>

      try {
        response = await fetcher.fetch(url)
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

      return (await response.json()) as WorldPermissions
    }
  }
}
