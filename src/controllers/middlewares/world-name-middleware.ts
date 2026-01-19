import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/http-commons'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import type { GlobalContext } from '../../types'

export interface WorldAuthMetadata {
  realm?: { serverName?: string | null }
  realmName?: string | null
}

/**
 * Middleware that extracts and validates the `worldName` from the signed fetch metadata.
 *
 * It attaches it to the request context so handlers can read it as `context.worldName`.
 * If the worldName cannot be extracted from the metadata, it returns a 400 error.
 *
 * After this middleware runs, `worldName` is guaranteed to be present in the context.
 * Handlers that run after this middleware should use `WorldHandlerContextWithPath` type
 * to indicate they expect `worldName` to be available.
 */
export const worldNameMiddleware: IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<GlobalContext & { worldName?: string }, string> &
    DecentralandSignatureContext<WorldAuthMetadata>
> = async (ctx, next) => {
  const {
    components: { logs }
  } = ctx

  const logger = logs.getLogger('world-name-middleware')

  const metadata = ctx.verification?.authMetadata
  const worldName = metadata?.realm?.serverName ?? metadata?.realmName

  logger.debug('Extracting world name from request metadata', {
    hasRealmServerName: metadata?.realm?.serverName ? 'true' : 'false',
    hasRealmName: metadata?.realmName ? 'true' : 'false'
  })

  if (!worldName) {
    logger.warn('World name extraction failed: no world name in metadata', {
      path: ctx.url?.pathname,
      method: ctx.request?.method
    })
    throw new InvalidRequestError('World name is required')
  }

  logger.debug('World name extracted successfully', {
    worldName,
    path: ctx.url?.pathname
  })

  ctx.worldName = worldName
  return await next()
}
