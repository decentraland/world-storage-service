import type { IHttpServerComponent } from '@dcl/core-commons'
import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { NotAuthorizedError } from '@dcl/http-commons'
import type { WorldStorageContext } from '../../types'

/**
 * Rejects requests signed by `AUTHORITATIVE_SERVER_ADDRESS`, even when that address also holds world
 * or scene permissions, so code running on the authoritative server can never reach the route.
 *
 * @throws {NotAuthorizedError} If the signer is the authoritative server
 */
export const rejectAuthoritativeServerMiddleware: IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<WorldStorageContext, string> & DecentralandSignatureContext
> = async (ctx, next) => {
  const authoritativeServerAddress = (await ctx.components.config.getString('AUTHORITATIVE_SERVER_ADDRESS'))
    ?.trim()
    .toLowerCase()
  if (authoritativeServerAddress && ctx.verification?.auth?.toLowerCase() === authoritativeServerAddress) {
    throw new NotAuthorizedError('Unauthorized: The authoritative server cannot export storage')
  }
  return next()
}
