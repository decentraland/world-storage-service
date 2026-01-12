import type { IHttpServerComponent } from '@well-known-components/interfaces'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { NotAuthorizedError, isNotAuthorizedError } from '../../utils/errors'
import type { GlobalContext } from '../../types'

/**
 * Middleware that validates if the signer of the request is authorized to perform operations.
 *
 * It reads the AUTHORIZED_ADDRESSES environment variable (comma-separated list of addresses)
 * and checks if the signer's address is included in that list.
 *
 * If no authorized addresses are configured, all signed requests are allowed.
 */
export const authorizationMiddleware: IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<GlobalContext, string> & DecentralandSignatureContext<unknown>
> = async (ctx, next) => {
  const {
    components: { config, logs }
  } = ctx

  const logger = logs.getLogger('authorization-middleware')

  try {
    const authorizedAddressesConfig = await config.getString('AUTHORIZED_ADDRESSES')

    // If no authorized addresses are configured, allow all signed requests
    if (!authorizedAddressesConfig) {
      return await next()
    }

    const authorizedAddresses = authorizedAddressesConfig
      .split(',')
      .map((addr) => addr.trim().toLowerCase())
      .filter((addr) => addr.length > 0)

    // If the list is empty after parsing, allow all signed requests
    if (authorizedAddresses.length === 0) {
      return await next()
    }

    const signerAddress = ctx.verification?.auth?.toLowerCase()

    if (!signerAddress) {
      logger.warn('No signer address found in verification context')
      throw new NotAuthorizedError('Unauthorized: No signer address found')
    }

    if (!authorizedAddresses.includes(signerAddress)) {
      logger.warn('Signer address is not authorized for operations', {
        signerAddress
      })
      throw new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations')
    }

    return await next()
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
