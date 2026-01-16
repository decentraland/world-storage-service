import type { IWorldsContentServerComponent, WorldPermissions } from './types'
import type { AppComponents } from '../../types'

// TODO: Add a cache layer to the component to avoid making unnecessary requests to the worlds content server.
export async function createWorldsContentServerComponent(
  components: Pick<AppComponents, 'fetcher' | 'config'>
): Promise<IWorldsContentServerComponent> {
  const { fetcher, config } = components

  const worldsContentServerUrl = await config.requireString('WORLDS_CONTENT_SERVER_URL')

  return {
    getPermissions: async (worldName: string): Promise<WorldPermissions> => {
      const response = await fetcher.fetch(
        `${worldsContentServerUrl}/world/${encodeURIComponent(worldName)}/permissions`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch world permissions for ${worldName}`)
      }

      return (await response.json()) as WorldPermissions
    }
  }
}
