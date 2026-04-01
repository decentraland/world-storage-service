import type { IConfigComponent, IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { errorMessageOrDefault } from '../../utils/errors'
import type { IWorldPermissionComponent } from './types'
import type { IWorldsContentServerComponent, WorldPermissions } from '../../adapters/worlds-content-server/types'

interface LandsParcelPermissionsResponse {
  owner: boolean
  operator: boolean
  updateOperator: boolean
  updateManager: boolean
  approvedForAll: boolean
}

/**
 * Creates the world permission component that checks user permissions for worlds and Genesis City scenes.
 *
 * This component orchestrates permission checks by:
 * 1. Routing Genesis City scenes (`worldName === "main"`) through parcel-based permission validation.
 * 2. Checking LAMBDAS parcel permissions for owner/operator-style access.
 * 3. Routing worlds (`*.dcl.eth`) through worlds-content-server permission checks.
 * 4. Granting access when the address is either the world owner or an allowed deployer.
 *
 * @param components - Required components: worldsContentServer, fetcher, config, logs
 * @returns IWorldPermissionComponent implementation
 */
export function createWorldPermissionComponent(components: {
  worldsContentServer: IWorldsContentServerComponent
  fetcher: IFetchComponent
  config: IConfigComponent
  logs: ILoggerComponent
}): IWorldPermissionComponent {
  const { worldsContentServer, fetcher, config, logs } = components
  const logger = logs.getLogger('world-permission')

  function isGenesisCityWorld(worldName: string): boolean {
    return worldName === 'main'
  }

  function hasAnyLandPermission(permissions: LandsParcelPermissionsResponse): boolean {
    return (
      permissions.owner ||
      permissions.operator ||
      permissions.updateOperator ||
      permissions.updateManager ||
      permissions.approvedForAll
    )
  }

  /**
   * Fetches land permissions for a Genesis City parcel via the LAMBDAS API.
   *
   * @param address - The wallet address to validate
   * @param parcel - The scene base parcel in `x,y` format
   * @returns The LAMBDAS permission payload, or `null` when the request is non-OK
   * @throws Error when the LAMBDAS request fails unexpectedly
   */
  async function fetchGenesisCityLandPermissions(
    address: string,
    parcel: string
  ): Promise<LandsParcelPermissionsResponse | null> {
    const lambdasUrl = await config.requireString('LAMBDAS_URL')
    const [x, y] = parcel.split(',')

    try {
      const response = await fetcher.fetch(
        `${lambdasUrl.replace(/\/$/, '')}/users/${address}/parcels/${x}/${y}/permissions`
      )

      if (!response.ok) {
        logger.warn('LAMBDAS permission check returned non-ok status', {
          address,
          parcel,
          status: response.status.toString()
        })
        return null
      }

      return (await response.json()) as LandsParcelPermissionsResponse
    } catch (error) {
      logger.warn('Failed to check land permissions via LAMBDAS', {
        address,
        parcel,
        error: errorMessageOrDefault(error)
      })
      throw error
    }
  }

  async function checkGenesisCityPermission(worldName: string, address: string, parcel: string): Promise<boolean> {
    const permissions = await fetchGenesisCityLandPermissions(address, parcel)
    const hasPermission = permissions !== null && hasAnyLandPermission(permissions)

    if (hasPermission) {
      logger.debug('Permission granted: user has land permission', {
        worldName,
        address,
        parcel
      })
      return true
    }

    logger.debug('Permission denied: no land permission for Genesis City parcel', {
      worldName,
      address,
      parcel
    })
    return false
  }

  async function fetchWorldPermissions(worldName: string, address: string): Promise<WorldPermissions> {
    try {
      return await worldsContentServer.getPermissions(worldName)
    } catch (error) {
      logger.warn('Failed to fetch permissions from content server', {
        worldName,
        address,
        error: errorMessageOrDefault(error)
      })
      throw error
    }
  }

  function isWorldOwner(permissions: WorldPermissions, address: string): boolean {
    return permissions.owner?.toLowerCase() === address
  }

  function hasDeployerPermission(permissions: WorldPermissions, address: string): boolean {
    return (
      permissions.permissions.deployment.type === 'allow-list' &&
      permissions.permissions.deployment.wallets.map(wallet => wallet.toLowerCase()).includes(address)
    )
  }

  async function checkWorldPermission(worldName: string, address: string): Promise<boolean> {
    const permissions = await fetchWorldPermissions(worldName, address)

    if (isWorldOwner(permissions, address)) {
      logger.debug('Permission granted: user is world owner', {
        worldName,
        address
      })
      return true
    }

    if (hasDeployerPermission(permissions, address)) {
      logger.debug('Permission granted: user has deployer permission', {
        worldName,
        address
      })
      return true
    }

    logger.debug('Permission denied: user has no world permission', {
      worldName,
      address
    })

    return false
  }

  return {
    hasWorldPermission: async (worldName: string, address: string, parcel: string): Promise<boolean> => {
      const normalizedAddress = address.toLowerCase()

      logger.debug('Checking world permission', {
        worldName,
        address: normalizedAddress,
        parcel
      })

      if (isGenesisCityWorld(worldName)) {
        return await checkGenesisCityPermission(worldName, normalizedAddress, parcel)
      }

      return await checkWorldPermission(worldName, normalizedAddress)
    }
  }
}
