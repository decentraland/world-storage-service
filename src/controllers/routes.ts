import type { RoutedContext } from '@well-known-components/http-server'
import { Router } from '@well-known-components/http-server'
import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { errorHandler } from '@dcl/http-commons'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { clearEnvStorageHandler } from './handlers/env-storage/clear-env-storage'
import { deleteEnvStorageHandler } from './handlers/env-storage/delete-env-storage'
import { getEnvStorageHandler } from './handlers/env-storage/get-env-storage'
import { listEnvKeysHandler } from './handlers/env-storage/list-env-keys'
import { upsertEnvStorageHandler } from './handlers/env-storage/upsert-env-storage'
import {
  clearAllPlayersStorageHandler,
  clearPlayerStorageHandler
} from './handlers/player-storage/clear-player-storage'
import { deletePlayerStorageHandler } from './handlers/player-storage/delete-player-storage'
import { getPlayerStorageHandler } from './handlers/player-storage/get-player-storage'
import { upsertPlayerStorageHandler } from './handlers/player-storage/upsert-player-storage'
import { UpsertEnvStorageRequestSchema, UpsertStorageRequestSchema } from './handlers/schemas'
import { clearWorldStorageHandler } from './handlers/world-storage/clear-world-storage'
import { deleteWorldStorageHandler } from './handlers/world-storage/delete-world-storage'
import { getWorldStorageHandler } from './handlers/world-storage/get-world-storage'
import { upsertWorldStorageHandler } from './handlers/world-storage/upsert-world-storage'
import {
  authorizationMiddleware,
  authorizedAddressesOnlyAuthorizationMiddleware,
  ownerAndDeployerOnlyAuthorizationMiddleware
} from './middlewares/authorization-middleware'
import { worldNameMiddleware } from './middlewares/world-name-middleware'
import type { GlobalContext } from '../types'

/**
 * Helper to cast handlers and middlewares that expect `worldName` to be present.
 * This cast is safe because `worldNameMiddleware` runs before any handler and guarantees
 * that `worldName` is set in the context.
 */
function withWorldName<Path extends string>(
  handler: IHttpServerComponent.IRequestHandler<RoutedContext<GlobalContext & { worldName: string }, Path>>
): IHttpServerComponent.IRequestHandler<RoutedContext<GlobalContext, Path>> {
  return handler as IHttpServerComponent.IRequestHandler<RoutedContext<GlobalContext, Path>>
}

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
      metadataValidator: metadata => metadata?.signer !== 'decentraland-kernel-scene' // prevent requests from scenes
    })

  router.use(signedFetchMiddleware())
  router.use(worldNameMiddleware)

  // All handlers below run after worldNameMiddleware, so worldName is guaranteed to be present.
  // The withWorldName helper casts handlers to be compatible with the router's GlobalContext type.

  // World storage endpoints
  router.get('/values/:key', withWorldName(authorizationMiddleware), withWorldName(getWorldStorageHandler))
  router.put(
    '/values/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertStorageRequestSchema),
    withWorldName(authorizationMiddleware),
    withWorldName(upsertWorldStorageHandler)
  )
  router.delete('/values/:key', withWorldName(authorizationMiddleware), withWorldName(deleteWorldStorageHandler))
  router.delete(
    '/values',
    withWorldName(ownerAndDeployerOnlyAuthorizationMiddleware),
    withWorldName(clearWorldStorageHandler)
  )

  // Player storage endpoints
  router.get(
    '/players/:player_address/values/:key',
    withWorldName(authorizationMiddleware),
    withWorldName(getPlayerStorageHandler)
  )
  router.put(
    '/players/:player_address/values/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertStorageRequestSchema),
    withWorldName(authorizationMiddleware),
    withWorldName(upsertPlayerStorageHandler)
  )
  router.delete(
    '/players/:player_address/values/:key',
    withWorldName(authorizationMiddleware),
    withWorldName(deletePlayerStorageHandler)
  )
  router.delete(
    '/players/:player_address/values',
    withWorldName(ownerAndDeployerOnlyAuthorizationMiddleware),
    withWorldName(clearPlayerStorageHandler)
  )
  router.delete(
    '/players',
    withWorldName(ownerAndDeployerOnlyAuthorizationMiddleware),
    withWorldName(clearAllPlayersStorageHandler)
  )

  // Env storage endpoints
  router.get('/env', withWorldName(ownerAndDeployerOnlyAuthorizationMiddleware), withWorldName(listEnvKeysHandler))
  router.get(
    '/env/:key',
    withWorldName(authorizedAddressesOnlyAuthorizationMiddleware),
    withWorldName(getEnvStorageHandler)
  )
  router.put(
    '/env/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertEnvStorageRequestSchema),
    withWorldName(ownerAndDeployerOnlyAuthorizationMiddleware),
    withWorldName(upsertEnvStorageHandler)
  )
  router.delete(
    '/env/:key',
    withWorldName(ownerAndDeployerOnlyAuthorizationMiddleware),
    withWorldName(deleteEnvStorageHandler)
  )
  router.delete(
    '/env',
    withWorldName(ownerAndDeployerOnlyAuthorizationMiddleware),
    withWorldName(clearEnvStorageHandler)
  )

  return router
}
