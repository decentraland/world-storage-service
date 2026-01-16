import type { IWorldPermissionComponent } from './types'
import type { IWorldsContentServerComponent } from '../../adapters/worlds-content-server/types'

export function createWorldPermissionComponent(components: {
  worldsContentServer: IWorldsContentServerComponent
}): IWorldPermissionComponent {
  const { worldsContentServer } = components

  return {
    hasWorldPermission: async (worldName: string, address: string): Promise<boolean> => {
      const normalizedAddress = address.toLowerCase()
      const permissions = await worldsContentServer.getPermissions(worldName)

      const isOwner = permissions.owner?.toLowerCase() === normalizedAddress

      const hasDeployerPermission =
        permissions.permissions.deployment.type === 'allow-list' &&
        permissions.permissions.deployment.wallets.map((wallet) => wallet.toLowerCase()).includes(normalizedAddress)

      return isOwner || hasDeployerPermission
    }
  }
}
