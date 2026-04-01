import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/http-commons'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import type { GlobalContext } from '../../types'

export interface SceneAuthMetadata {
  realm?: { serverName?: string | null }
  realmName?: string | null
  parcel?: string | null
}

/**
 * Middleware that extracts and validates the `worldName` and `parcel` from the signed fetch metadata,
 * then resolves the `placeId` via the Places API.
 *
 * It attaches them to the request context so handlers can read them as `context.worldName`,
 * `context.parcel`, and `context.placeId`. If the worldName cannot be extracted from the metadata,
 * it returns a 400 error. If the parcel is absent, it defaults to `"0,0"` for backward compatibility.
 *
 * After this middleware runs, `worldName`, `parcel`, and `placeId` are guaranteed to be present
 * in the context. Handlers that run after this middleware should use `WorldHandlerContextWithPath`
 * type to indicate they expect these values to be available.
 */
export const sceneContextMiddleware: IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<
    GlobalContext & { worldName?: string; parcel?: string; placeId?: string },
    string
  > &
    DecentralandSignatureContext<SceneAuthMetadata>
> = async (ctx, next) => {
  const {
    components: { logs, places }
  } = ctx

  const logger = logs.getLogger('scene-context-middleware')

  const metadata = ctx.verification?.authMetadata
  const worldName = metadata?.realm?.serverName ?? metadata?.realmName
  const parcel = metadata?.parcel ?? '0,0'

  logger.debug('Extracting scene context from request metadata', {
    hasRealmServerName: metadata?.realm?.serverName ? 'true' : 'false',
    hasRealmName: metadata?.realmName ? 'true' : 'false',
    hasParcel: metadata?.parcel ? 'true' : 'false'
  })

  if (!worldName) {
    logger.warn('Scene context extraction failed: no world name in metadata', {
      path: ctx.url?.pathname,
      method: ctx.request?.method
    })
    throw new InvalidRequestError('World name is required')
  }

  const placeId = await places.resolvePlaceId(worldName, parcel)

  logger.debug('Scene context extracted successfully', {
    worldName,
    parcel,
    placeId,
    path: ctx.url?.pathname
  })

  ctx.worldName = worldName
  ctx.parcel = parcel
  ctx.placeId = placeId
  return await next()
}
