import type { IHttpServerComponent } from '@well-known-components/interfaces'
import type { WorldStorageContext } from '../../types'
const DUMMY_WORLD_NAME = 'worldname.dcl.eth'

/**
 * Dummy middleware that injects a fixed `worldName` into every request.
 *
 * It attaches it to the request context so handlers can read it as `context.worldName`.
 */
export const worldNameMiddleware: IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<WorldStorageContext, string>
> = async (ctx, next) => {
  ctx.worldName = DUMMY_WORLD_NAME
  return await next()
}
