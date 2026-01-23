import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { NotAuthorizedError } from '@dcl/http-commons'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { isErrorWithMessage } from '../../utils/errors'
import type { WorldStorageContext } from '../../types'

export interface AuthorizationMiddlewareOptions {
  allowAuthorizedAddresses: boolean
  allowOwnersAndDeployers: boolean
}

/**
 * Returns a safe representation of the signer address for logging.
 * If the address matches the authoritative server address, returns 'AUTHORITATIVE_SERVER_ADDRESS'
 * to avoid exposing it in logs.
 */
function safeAddress(signerAddress: string, authoritativeServerAddress: string | undefined): string {
  if (authoritativeServerAddress && signerAddress.toLowerCase() === authoritativeServerAddress.toLowerCase()) {
    return 'AUTHORITATIVE_SERVER_ADDRESS'
  }
  return signerAddress
}

/**
 * Creates a middleware that validates if the signer of the request is authorized to perform operations.
 *
 * If the `allowAuthorizedAddresses` option is enabled, it first checks the AUTHORITATIVE_SERVER_ADDRESS
 * and AUTHORIZED_ADDRESSES environment variables (comma-separated list of addresses) to allow
 * additional addresses. This is done first to avoid unnecessary world permission checks for
 * authoritative servers which will never have world permissions.
 *
 * If the signer is not in the authorized addresses list (or if `allowAuthorizedAddresses` is false),
 * and `allowOwnersAndDeployers` is true, it uses the world permission component to check if the signer's
 * address is the owner or has deployer permissions for the world.
 *
 * Authorization flow:
 * 1. If `allowAuthorizedAddresses` is true and signer is in AUTHORITATIVE_SERVER_ADDRESS or AUTHORIZED_ADDRESSES → allowed
 * 2. If `allowOwnersAndDeployers` is true and the signer address is the owner or has deployer permissions → allowed
 * 3. Otherwise → unauthorized error
 */
export function createAuthorizationMiddleware(
  options: AuthorizationMiddlewareOptions
): IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<WorldStorageContext, string> & DecentralandSignatureContext<unknown>
> {
  const { allowAuthorizedAddresses, allowOwnersAndDeployers } = options

  return async (ctx, next) => {
    const {
      components: { config, logs, worldPermission }
    } = ctx

    const logger = logs.getLogger('authorization-middleware')

    const signerAddress = ctx.verification?.auth?.toLowerCase()

    if (!signerAddress) {
      throw new NotAuthorizedError('Unauthorized: No signer address found')
    }

    // worldName is guaranteed to be present by worldNameMiddleware (enforced by WorldStorageContext type)
    const { worldName } = ctx

    // Fetch authoritative server address early for safe logging
    const authoritativeServerAddress = await config.getString('AUTHORITATIVE_SERVER_ADDRESS')

    logger.debug('Checking authorization', {
      signerAddress: safeAddress(signerAddress, authoritativeServerAddress),
      worldName,
      allowAuthorizedAddresses: allowAuthorizedAddresses.toString(),
      allowOwnersAndDeployers: allowOwnersAndDeployers.toString()
    })

    // 1. If allowAuthorizedAddresses is enabled, check if signer is in authorized addresses first
    if (allowAuthorizedAddresses) {
      const authorizedAddressesConfig = await config.getString('AUTHORIZED_ADDRESSES')

      const allowedAddresses = [authoritativeServerAddress, ...(authorizedAddressesConfig?.split(',') || [])]
        .map((addr) => addr?.trim().toLowerCase())
        .filter((addr): addr is string => !!addr && addr.length > 0)

      if (allowedAddresses.includes(signerAddress)) {
        logger.debug('Authorization granted via authorized addresses list', {
          signerAddress: safeAddress(signerAddress, authoritativeServerAddress),
          worldName
        })
        return await next()
      }
    }

    // 2. If allowOwnersAndDeployers is enabled, check if signer has world permission (owner or deployer)
    if (allowOwnersAndDeployers) {
      let hasPermission: boolean
      try {
        hasPermission = await worldPermission.hasWorldPermission(worldName, signerAddress)
      } catch (error) {
        logger.warn('Authorization check failed: unable to verify world permissions', {
          worldName,
          signerAddress: safeAddress(signerAddress, authoritativeServerAddress),
          error: isErrorWithMessage(error) ? error.message : 'Unknown error'
        })
        throw new NotAuthorizedError('Unauthorized: Failed to verify world permissions')
      }

      if (hasPermission) {
        logger.debug('Authorization granted via world permission', {
          signerAddress: safeAddress(signerAddress, authoritativeServerAddress),
          worldName
        })
        return await next()
      }
    }

    // 3. Otherwise, deny access
    logger.warn('Authorization denied: signer has no permission for this world', {
      signerAddress: safeAddress(signerAddress, authoritativeServerAddress),
      worldName,
      allowAuthorizedAddresses: allowAuthorizedAddresses.toString(),
      allowOwnersAndDeployers: allowOwnersAndDeployers.toString()
    })
    throw new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
  }
}

/**
 * General-purpose authorization middleware that allows:
 * - Authorized addresses (AUTHORITATIVE_SERVER_ADDRESS and addresses in AUTHORIZED_ADDRESSES)
 * - World owners and deployers
 *
 * Use this for standard operations where both authorized addresses and world permissions
 * should have access. This is the default choice for most endpoints.
 */
export const authorizationMiddleware = createAuthorizationMiddleware({
  allowAuthorizedAddresses: true,
  allowOwnersAndDeployers: true
})

/**
 * Restrictive authorization middleware that allows:
 * - World owners and deployers only
 *
 * Authorized addresses (including the authoritative server) are NOT allowed.
 * Use this for sensitive operations that should only be accessible by world owners
 * and deployers, such as env storage write/delete operations.
 */
export const ownerAndDeployerOnlyAuthorizationMiddleware = createAuthorizationMiddleware({
  allowAuthorizedAddresses: false,
  allowOwnersAndDeployers: true
})

/**
 * Restrictive authorization middleware that allows:
 * - Authorized addresses (AUTHORITATIVE_SERVER_ADDRESS and addresses in AUTHORIZED_ADDRESSES) only
 *
 * World owners and deployers are NOT allowed, even if they have permissions.
 * Use this for operations that should exclusively be accessible by the authoritative server,
 * such as GET requests for env variables.
 */
export const authorizedAddressesOnlyAuthorizationMiddleware = createAuthorizationMiddleware({
  allowAuthorizedAddresses: true,
  allowOwnersAndDeployers: false
})
