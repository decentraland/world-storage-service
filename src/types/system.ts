import type {
  IBaseComponent,
  IConfigComponent,
  IFetchComponent,
  IHttpServerComponent,
  ILoggerComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import type { IPgComponent } from '@well-known-components/pg-component'
import type { ISchemaValidatorComponent } from '@dcl/schema-validator-component'
import type { IEncryptionComponent } from '../adapters/encryption/types'
import type { IEnvStorageComponent } from '../adapters/env-storage/types'
import type { IPlayerStorageComponent } from '../adapters/player-storage/types'
import type { IWorldStorageComponent } from '../adapters/world-storage/types'
import type { IWorldsContentServerComponent } from '../adapters/worlds-content-server/types'
import type { IWorldPermissionsManagerComponent } from '../logic/world-permissions-manager/types'
import type { metricDeclarations } from '../metrics'

export interface GlobalContext {
  components: BaseComponents
}

export interface WorldStorageContext extends GlobalContext {
  worldName: string
}

// components used in every environment
export interface BaseComponents {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  fetcher: IFetchComponent
  encryption: IEncryptionComponent
  worldStorage: IWorldStorageComponent
  playerStorage: IPlayerStorageComponent
  envStorage: IEnvStorageComponent
  worldsContentServer: IWorldsContentServerComponent
  worldPermissionsManager: IWorldPermissionsManagerComponent
  schemaValidator: ISchemaValidatorComponent<GlobalContext>
}

// components used in runtime
export type AppComponents = BaseComponents & {
  statusChecks: IBaseComponent
  pg: IPgComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
}

// this type simplifies the typings of http handlers
export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = string
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>

// this type simplifies the typings of http handlers that run after worldNameMiddleware
// and guarantees worldName is present
export type WorldHandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = string
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }> & { worldName: string },
  Path
>

export type Context<Path extends string = string> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>
