import type { IWorldContentServerComponent, WorldPermissions } from './types'
import type { AppComponents } from '../../types'

export async function createWorldContentServerComponent(
  components: Pick<AppComponents, 'fetcher' | 'config'>
): Promise<IWorldContentServerComponent> {
  const { fetcher, config } = components

  const worldContentServerUrl = await config.requireString('WORLD_CONTENT_SERVER_URL')

  return {
    getPermissions: async (worldName: string): Promise<WorldPermissions> => {
      const response = await fetcher.fetch(
        `${worldContentServerUrl}/world/${encodeURIComponent(worldName)}/permissions`
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch world permissions for ${worldName}`)
      }

      return (await response.json()) as WorldPermissions
    }
  }
}
