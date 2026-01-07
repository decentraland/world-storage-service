import { Router } from '@well-known-components/http-server'
import { errorHandler } from '@dcl/platform-server-commons'
import { deleteWorldStorageHandler } from './handlers/delete-world-storage'
import { getWorldStorageHandler } from './handlers/get-world-storage'
import { upsertWorldStorageHandler } from './handlers/upsert-world-storage'
import { worldNameMiddleware } from './middlewares/world-name-middleware'
import type { GlobalContext } from '../types'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(_: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()

  router.use(errorHandler)
  router.use(worldNameMiddleware)

  router.get('/storage/world/:key', getWorldStorageHandler)
  router.put('/storage/world/:key', upsertWorldStorageHandler)
  router.delete('/storage/world/:key', deleteWorldStorageHandler)

  return router
}
