import { Router } from '@well-known-components/http-server'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { errorHandler } from '@dcl/platform-server-commons'
import { deleteWorldStorageHandler } from './handlers/delete-world-storage'
import { getWorldStorageHandler } from './handlers/get-world-storage'
import { upsertWorldStorageHandler } from './handlers/upsert-world-storage'
import { worldNameMiddleware } from './middlewares/world-name-middleware'
import type { GlobalContext } from '../types'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(context: GlobalContext): Promise<Router<GlobalContext>> {
  const { fetcher } = context.components
  const router = new Router<GlobalContext>()

  router.use(errorHandler)

  const signedFetchMiddleware = ({ optional = false }: { optional?: boolean } = {}) =>
    wellKnownComponents({
      fetcher,
      optional,
      onError: (err: Error) => ({
        error: err.message,
        message: 'This endpoint requires a signed fetch request. See ADR-44.'
      }),
      metadataValidator: (metadata) => {
        console.log('metadata', metadata)
        return true
      } // TODO: Add metadata validator to check for world name and authoritative server origin
    })

  router.use(signedFetchMiddleware())
  router.use(worldNameMiddleware)

  router.get('/storage/world/:key', getWorldStorageHandler)
  router.put('/storage/world/:key', upsertWorldStorageHandler)
  router.delete('/storage/world/:key', deleteWorldStorageHandler)

  return router
}
