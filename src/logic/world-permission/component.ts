import { errorMessageOrDefault } from '../../utils/errors'
import { UPSTREAM_FETCH_OPTIONS, discardResponseBody } from '../../utils/upstreamFetch'
import { isSharedRealmName } from '../../utils/worldName'
import type { IWorldPermissionComponent } from './types'
import type { WorldPermissions } from '../../adapters/worlds-content-server/types'
import type { AppComponents } from '../../types'

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
 * 1. Routing Genesis City scenes (shared realms such as `main`) through parcel-based permission validation.
 * 2. Checking LAMBDAS parcel permissions for owner/operator-style access.
 * 3. Routing worlds (`*.dcl.eth`) through worlds-content-server permission checks.
 * 4. Granting access when the address is either the world owner or an allowed deployer.
 *
 * @param components - Required components: worldsContentServer, fetcher, config, logs
 * @returns Promise resolving to IWorldPermissionComponent implementation
 */
export async function createWorldPermissionComponent(
  components: Pick<AppComponents, 'worldsContentServer' | 'fetcher' | 'config' | 'logs'>
): Promise<IWorldPermissionComponent> {
  const { worldsContentServer, fetcher, config, logs } = components
  const logger = logs.getLogger('world-permission')

  // Required at startup so a missing/typoed variable fails the deployment immediately
  // instead of surfacing on the first Genesis City permission check.
  const lambdasUrl = (await config.requireString('LAMBDAS_URL')).replace(/\/$/, '')

  function hasAnyLandPermission(permissions: LandsParcelPermissionsResponse): boolean {
    // Strict `=== true` so a malformed upstream payload with a truthy non-boolean field
    // (e.g. `owner: "yes"`) fails closed instead of being read as a granted permission.
    return (
      permissions.owner === true ||
      permissions.operator === true ||
      permissions.updateOperator === true ||
      permissions.updateManager === true ||
      permissions.approvedForAll === true
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
    // The parcel format is validated by sceneContextMiddleware; the coordinates are still
    // encoded here so this authorization-relevant URL can never be shaped by its input.
    const [x, y] = parcel.split(',')

    try {
      const response = await fetcher.fetch(
        `${lambdasUrl}/users/${encodeURIComponent(address)}/parcels/${encodeURIComponent(x)}/${encodeURIComponent(y)}/permissions`,
        UPSTREAM_FETCH_OPTIONS
      )

      if (!response.ok) {
        await discardResponseBody(response)
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
    const { deployment } = permissions.permissions
    return (
      deployment.type === 'allow-list' &&
      (deployment.wallets ?? []).map(wallet => wallet.toLowerCase()).includes(address)
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

      if (isSharedRealmName(worldName)) {
        return await checkGenesisCityPermission(worldName, normalizedAddress, parcel)
      }

      return await checkWorldPermission(worldName, normalizedAddress)
    }
  }
}
