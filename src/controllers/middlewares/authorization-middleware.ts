import type { IHttpServerComponent } from '@well-known-components/interfaces'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { NotAuthorizedError, isErrorWithMessage, isNotAuthorizedError } from '../../utils/errors'
import type { WorldStorageContext } from '../../types'

export interface AuthorizationMiddlewareOptions {
  allowAuthorizedAddresses?: boolean
}

/**
 * Creates a middleware that validates if the signer of the request is authorized to perform operations.
 *
 * It fetches the world permissions from the worlds content server and checks if the signer's address
 * is the owner or has deployer permissions for the world.
 *
 * If the `allowAuthorizedAddresses` option is enabled, it also checks the AUTHORITATIVE_SERVER_ADDRESS
 * and AUTHORIZED_ADDRESSES environment variables (comma-separated list of addresses) to allow
 * additional addresses.
 *
 * Authorization flow:
 * 1. If the signer address is the owner or has deployer permissions → allowed
 * 2. If `allowAuthorizedAddresses` is true and signer is in AUTHORITATIVE_SERVER_ADDRESS or AUTHORIZED_ADDRESSES → allowed
 * 3. Otherwise → unauthorized error
 */
export function createAuthorizationMiddleware(
  options: AuthorizationMiddlewareOptions = {}
): IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<WorldStorageContext, string> & DecentralandSignatureContext<unknown>
> {
  const { allowAuthorizedAddresses = false } = options

  return async (ctx, next) => {
    const {
      components: { config, logs, worldsContentServer }
    } = ctx

    const logger = logs.getLogger('authorization-middleware')

    try {
      const signerAddress = ctx.verification?.auth?.toLowerCase()

      if (!signerAddress) {
        logger.warn('No signer address found in verification context')
        throw new NotAuthorizedError('Unauthorized: No signer address found')
      }

      const worldName = ctx.worldName

      if (!worldName) {
        logger.warn('No world name found in context')
        throw new NotAuthorizedError('Unauthorized: No world name found')
      }

      // Fetch world permissions from worlds content server
      let worldPermissions
      try {
        worldPermissions = await worldsContentServer.getPermissions(worldName)
      } catch (error) {
        logger.warn('Failed to fetch world permissions', {
          worldName,
          error: isErrorWithMessage(error) ? error.message : 'Unknown error'
        })
        throw new NotAuthorizedError('Unauthorized: Failed to verify world permissions')
      }

      // Check if signer is the owner
      const isOwner = worldPermissions.owner?.toLowerCase() === signerAddress

      // Check if signer has deployer permissions
      const hasDeployerPermissions = worldPermissions.permissions.deployment.wallets
        .map((wallet) => wallet.toLowerCase())
        .includes(signerAddress)

      // 1. If the signer is the owner or has deployer permissions, allow access
      if (isOwner || hasDeployerPermissions) {
        return await next()
      }

      // 2. If allowAuthorizedAddresses is enabled, check if signer is in authorized addresses
      if (allowAuthorizedAddresses) {
        const authoritativeServerAddress = await config.getString('AUTHORITATIVE_SERVER_ADDRESS')
        const authorizedAddressesConfig = await config.getString('AUTHORIZED_ADDRESSES')

        const allowedAddresses = [authoritativeServerAddress, ...(authorizedAddressesConfig?.split(',') || [])]
          .map((addr) => addr?.trim().toLowerCase())
          .filter((addr): addr is string => !!addr && addr.length > 0)

        if (allowedAddresses.includes(signerAddress)) {
          return await next()
        }
      }

      // 3. Otherwise, deny access
      logger.warn('Signer address is not authorized for operations', {
        signerAddress,
        worldName
      })
      throw new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
    } catch (error) {
      if (isNotAuthorizedError(error)) {
        return {
          status: 401,
          body: {
            message: error.message
          }
        }
      }
      throw error
    }
  }
}

/**
 * Authorization middleware that allows only owners and deployers.
 * Use this for sensitive operations like env storage management.
 */
export const ownerAndDeployerOnlyMiddleware = createAuthorizationMiddleware({ allowAuthorizedAddresses: false })

/**
 * Authorization middleware that allows owners, deployers, and authorized addresses.
 * Use this for general operations where authorized addresses should have access.
 */
export const authorizationMiddleware = createAuthorizationMiddleware({ allowAuthorizedAddresses: true })
