import type { RoutedContext } from '@well-known-components/http-server'
import { Router } from '@well-known-components/http-server'
import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { errorHandler } from '@dcl/http-commons'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { clearEnvStorageHandler } from './handlers/env-storage/clear-env-storage'
import { deleteEnvStorageHandler } from './handlers/env-storage/delete-env-storage'
import { getEnvStorageHandler } from './handlers/env-storage/get-env-storage'
import { getEnvUsageHandler } from './handlers/env-storage/get-env-usage'
import { listEnvKeysHandler } from './handlers/env-storage/list-env-keys'
import { upsertEnvStorageHandler } from './handlers/env-storage/upsert-env-storage'
import {
  clearAllPlayersStorageHandler,
  clearPlayerStorageHandler
} from './handlers/player-storage/clear-player-storage'
import { deletePlayerStorageHandler } from './handlers/player-storage/delete-player-storage'
import { getPlayerStorageHandler } from './handlers/player-storage/get-player-storage'
import { getPlayerUsageHandler } from './handlers/player-storage/get-player-usage'
import { listPlayerStorageHandler } from './handlers/player-storage/list-player-storage'
import { listPlayersHandler } from './handlers/player-storage/list-players'
import { upsertPlayerStorageHandler } from './handlers/player-storage/upsert-player-storage'
import { UpsertEnvStorageRequestSchema, UpsertStorageRequestSchema } from './handlers/schemas'
import { clearWorldStorageHandler } from './handlers/world-storage/clear-world-storage'
import { deleteWorldStorageHandler } from './handlers/world-storage/delete-world-storage'
import { getWorldStorageHandler } from './handlers/world-storage/get-world-storage'
import { getWorldUsageHandler } from './handlers/world-storage/get-world-usage'
import { listWorldStorageHandler } from './handlers/world-storage/list-world-storage'
import { upsertWorldStorageHandler } from './handlers/world-storage/upsert-world-storage'
import {
  authorizationMiddleware,
  authorizedAddressesOnlyAuthorizationMiddleware,
  ownerAndDeployerOnlyAuthorizationMiddleware
} from './middlewares/authorization-middleware'
import { sceneContextMiddleware } from './middlewares/scene-context-middleware'
import type { GlobalContext } from '../types'

/**
 * Helper to cast handlers and middlewares that expect `worldName`, `parcel`, and `placeId` to be present.
 * This cast is safe because `sceneContextMiddleware` runs before any handler and guarantees
 * that `worldName`, `parcel`, and `placeId` are set in the context.
 */
function withSceneContext<Path extends string>(
  handler: IHttpServerComponent.IRequestHandler<
    RoutedContext<GlobalContext & { worldName: string; parcel: string; placeId: string }, Path>
  >
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
  router.use(sceneContextMiddleware)

  // All handlers below run after sceneContextMiddleware, so worldName, parcel, and placeId are guaranteed to be present.
  // The withSceneContext helper casts handlers to be compatible with the router's GlobalContext type.

  // Usage endpoints
  router.get('/usage/world', withSceneContext(authorizationMiddleware), withSceneContext(getWorldUsageHandler))
  router.get(
    '/usage/players/:player_address',
    withSceneContext(authorizationMiddleware),
    withSceneContext(getPlayerUsageHandler)
  )
  router.get(
    '/usage/env',
    withSceneContext(ownerAndDeployerOnlyAuthorizationMiddleware),
    withSceneContext(getEnvUsageHandler)
  )

  // World storage endpoints
  router.get('/values', withSceneContext(authorizationMiddleware), withSceneContext(listWorldStorageHandler))
  router.get('/values/:key', withSceneContext(authorizationMiddleware), withSceneContext(getWorldStorageHandler))
  router.put(
    '/values/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertStorageRequestSchema),
    withSceneContext(authorizationMiddleware),
    withSceneContext(upsertWorldStorageHandler)
  )
  router.delete('/values/:key', withSceneContext(authorizationMiddleware), withSceneContext(deleteWorldStorageHandler))
  router.delete(
    '/values',
    withSceneContext(ownerAndDeployerOnlyAuthorizationMiddleware),
    withSceneContext(clearWorldStorageHandler)
  )

  // Player storage endpoints
  router.get('/players', withSceneContext(authorizationMiddleware), withSceneContext(listPlayersHandler))
  router.get(
    '/players/:player_address/values',
    withSceneContext(authorizationMiddleware),
    withSceneContext(listPlayerStorageHandler)
  )
  router.get(
    '/players/:player_address/values/:key',
    withSceneContext(authorizationMiddleware),
    withSceneContext(getPlayerStorageHandler)
  )
  router.put(
    '/players/:player_address/values/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertStorageRequestSchema),
    withSceneContext(authorizationMiddleware),
    withSceneContext(upsertPlayerStorageHandler)
  )
  router.delete(
    '/players/:player_address/values/:key',
    withSceneContext(authorizationMiddleware),
    withSceneContext(deletePlayerStorageHandler)
  )
  router.delete(
    '/players/:player_address/values',
    withSceneContext(ownerAndDeployerOnlyAuthorizationMiddleware),
    withSceneContext(clearPlayerStorageHandler)
  )
  router.delete(
    '/players',
    withSceneContext(ownerAndDeployerOnlyAuthorizationMiddleware),
    withSceneContext(clearAllPlayersStorageHandler)
  )

  // Env storage endpoints
  router.get(
    '/env',
    withSceneContext(ownerAndDeployerOnlyAuthorizationMiddleware),
    withSceneContext(listEnvKeysHandler)
  )
  router.get(
    '/env/:key',
    withSceneContext(authorizedAddressesOnlyAuthorizationMiddleware),
    withSceneContext(getEnvStorageHandler)
  )
  router.put(
    '/env/:key',
    schemaValidator.withSchemaValidatorMiddleware(UpsertEnvStorageRequestSchema),
    withSceneContext(ownerAndDeployerOnlyAuthorizationMiddleware),
    withSceneContext(upsertEnvStorageHandler)
  )
  router.delete(
    '/env/:key',
    withSceneContext(ownerAndDeployerOnlyAuthorizationMiddleware),
    withSceneContext(deleteEnvStorageHandler)
  )
  router.delete(
    '/env',
    withSceneContext(ownerAndDeployerOnlyAuthorizationMiddleware),
    withSceneContext(clearEnvStorageHandler)
  )

  return router
}
