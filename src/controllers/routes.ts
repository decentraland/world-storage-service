import { Router } from '@well-known-components/http-server'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { errorHandler } from '@dcl/platform-server-commons'
import { deleteWorldStorageHandler } from './handlers/delete-world-storage'
import { getWorldStorageHandler } from './handlers/get-world-storage'
import { UpsertWorldStorageRequestSchema } from './handlers/schemas'
import { upsertWorldStorageHandler } from './handlers/upsert-world-storage'
import { worldNameMiddleware } from './middlewares/world-name-middleware'
import type { GlobalContext } from '../types'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(context: GlobalContext): Promise<Router<GlobalContext>> {
  const { fetcher, schemaValidator } = context.components
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
      metadataValidator: (metadata) => metadata?.signer !== 'decentraland-kernel-scene' // prevent requests from scenes TODO: check if we don't want the scenes to be able to get values
    })

  router.use(signedFetchMiddleware())
  router.use(worldNameMiddleware)

  router.get('/values/:key', getWorldStorageHandler)
  router.put(
    '/values/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertWorldStorageRequestSchema),
    upsertWorldStorageHandler
  )
  router.delete('/values/:key', deleteWorldStorageHandler)

  return router
}
