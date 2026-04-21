import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/http-commons'
import type { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import type { GlobalContext } from '../../types'

export interface SceneAuthMetadata {
  realm?: { serverName?: string | null }
  realmName?: string | null
  parcel?: string | null
}

/** Fallback realm name used to identify Genesis City when the caller does not
 * send a `realmName`/`realm.serverName` (admin tooling that writes env vars for
 * lands, for instance). Treated as "not a .dcl.eth world" downstream, which is
 * all the Places resolution needs. */
const GENESIS_CITY_REALM = 'main'

/**
 * Middleware that extracts and validates the `worldName` and `parcel` from the signed fetch metadata,
 * then resolves the `placeId` via the Places API.
 *
 * It attaches them to the request context so handlers can read them as `context.worldName`,
 * `context.parcel`, and `context.placeId`. The request must carry either:
 *   - `realm.serverName`/`realmName` (world or Genesis City realm name), OR
 *   - `parcel` (land coordinates), in which case the realm defaults to Genesis City.
 *
 * Missing both → 400. Missing parcel alone → defaults to `"0,0"` for backward compatibility.
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
  // Normalize empty strings to undefined so a blank `realmName` behaves the same
  // as a missing one — avoids hitting Places with `names=&positions=...`.
  const realmFromMetadata = metadata?.realm?.serverName || metadata?.realmName || undefined
  const parcel = metadata?.parcel || undefined

  logger.debug('Extracting scene context from request metadata', {
    hasRealmServerName: metadata?.realm?.serverName ? 'true' : 'false',
    hasRealmName: metadata?.realmName ? 'true' : 'false',
    hasParcel: parcel ? 'true' : 'false'
  })

  if (!realmFromMetadata && !parcel) {
    logger.warn('Scene context extraction failed: request is missing both realm name and parcel', {
      path: ctx.url?.pathname,
      method: ctx.request?.method
    })
    throw new InvalidRequestError('Request must include a realm name or a parcel')
  }

  const isWorld = realmFromMetadata?.endsWith('.dcl.eth') ?? false
  const worldName = isWorld && realmFromMetadata ? realmFromMetadata : GENESIS_CITY_REALM
  const resolvedParcel = parcel ?? '0,0'

  const placeId = await places.resolvePlaceId(worldName, resolvedParcel)

  logger.debug('Scene context extracted successfully', {
    worldName,
    parcel: resolvedParcel,
    placeId,
    path: ctx.url?.pathname
  })

  ctx.worldName = worldName
  ctx.parcel = resolvedParcel
  ctx.placeId = placeId
  return await next()
}
