import type { IHttpServerComponent } from '@well-known-components/interfaces'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import type { WorldStorageContext } from '../../types'

export interface WorldAuthMetadata {
  realm?: { serverName?: string | null }
  realmName?: string | null
}

/**
 * Middleware that extracts and validates the `worldName` from the signed fetch metadata.
 *
 * It attaches it to the request context so handlers can read it as `context.worldName`.
 * If the worldName cannot be extracted from the metadata, it returns a 400 error.
 */
export const worldNameMiddleware: IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<WorldStorageContext, string> & DecentralandSignatureContext<WorldAuthMetadata>
> = async (ctx, next) => {
  const metadata = ctx.verification?.authMetadata
  const worldName = metadata?.realm?.serverName ?? metadata?.realmName

  if (!worldName) {
    throw new InvalidRequestError('World name is required')
  }

  ctx.worldName = worldName
  return await next()
}
