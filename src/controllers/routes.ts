import { Router } from '@well-known-components/http-server'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { errorHandler } from '@dcl/platform-server-commons'
import { deleteEnvStorageHandler } from './handlers/delete-env-storage'
import { deletePlayerStorageHandler } from './handlers/delete-player-storage'
import { deleteWorldStorageHandler } from './handlers/delete-world-storage'
import { getEnvStorageHandler } from './handlers/get-env-storage'
import { getPlayerStorageHandler } from './handlers/get-player-storage'
import { getWorldStorageHandler } from './handlers/get-world-storage'
import { UpsertEnvStorageRequestSchema, UpsertStorageRequestSchema } from './handlers/schemas'
import { upsertEnvStorageHandler } from './handlers/upsert-env-storage'
import { upsertPlayerStorageHandler } from './handlers/upsert-player-storage'
import { upsertWorldStorageHandler } from './handlers/upsert-world-storage'
import { authorizationMiddleware } from './middlewares/authorization-middleware'
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

  // World storage endpoints
  router.get('/values/:key', getWorldStorageHandler)
  router.put(
    '/values/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertStorageRequestSchema),
    authorizationMiddleware,
    upsertWorldStorageHandler
  )
  router.delete('/values/:key', authorizationMiddleware, deleteWorldStorageHandler)

  // Player storage endpoints
  router.get('/players/:player_address/values/:key', getPlayerStorageHandler)
  router.put(
    '/players/:player_address/values/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertStorageRequestSchema),
    authorizationMiddleware,
    upsertPlayerStorageHandler
  )
  router.delete('/players/:player_address/values/:key', authorizationMiddleware, deletePlayerStorageHandler)

  // Env storage endpoints
  router.get('/env/:key', authorizationMiddleware, getEnvStorageHandler)
  router.put(
    '/env/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertEnvStorageRequestSchema),
    authorizationMiddleware,
    upsertEnvStorageHandler
  )
  router.delete('/env/:key', authorizationMiddleware, deleteEnvStorageHandler)

  return router
}
