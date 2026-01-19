import type { ILoggerComponent } from '@well-known-components/interfaces'
import { errorMessageOrDefault } from '../../utils/errors'
import type { IWorldPermissionComponent } from './types'
import type { IWorldsContentServerComponent } from '../../adapters/worlds-content-server/types'

/**
 * Creates the world permission component that checks user permissions for worlds.
 *
 * This component orchestrates permission checks by:
 * 1. Fetching permissions from the worlds content server
 * 2. Checking if the address is the world owner
 * 3. Checking if the address has deployer permissions
 *
 * @param components - Required components: worldsContentServer, logs
 * @returns IWorldPermissionComponent implementation
 */
export function createWorldPermissionComponent(components: {
  worldsContentServer: IWorldsContentServerComponent
  logs: ILoggerComponent
}): IWorldPermissionComponent {
  const { worldsContentServer, logs } = components
  const logger = logs.getLogger('world-permission')

  return {
    hasWorldPermission: async (worldName: string, address: string): Promise<boolean> => {
      const normalizedAddress = address.toLowerCase()

      logger.debug('Checking world permission', {
        worldName,
        address: normalizedAddress
      })

      let permissions
      try {
        permissions = await worldsContentServer.getPermissions(worldName)
      } catch (error) {
        logger.warn('Failed to fetch permissions from content server', {
          worldName,
          address: normalizedAddress,
          error: errorMessageOrDefault(error)
        })
        throw error
      }

      const isOwner = permissions.owner?.toLowerCase() === normalizedAddress

      if (isOwner) {
        logger.debug('Permission granted: user is world owner', {
          worldName,
          address: normalizedAddress
        })
        return true
      }

      const hasDeployerPermission =
        permissions.permissions.deployment.type === 'allow-list' &&
        permissions.permissions.deployment.wallets.map((wallet) => wallet.toLowerCase()).includes(normalizedAddress)

      if (hasDeployerPermission) {
        logger.debug('Permission granted: user has deployer permission', {
          worldName,
          address: normalizedAddress
        })
        return true
      }

      logger.debug('Permission denied: user has no world permission', {
        worldName,
        address: normalizedAddress
      })

      return false
    }
  }
}
