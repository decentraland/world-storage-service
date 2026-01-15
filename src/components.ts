import { resolve } from 'path'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { Verbosity, instrumentHttpServerWithRequestLogger } from '@well-known-components/http-requests-logger-component'
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry
} from '@well-known-components/http-server'
import { createHttpTracerComponent } from '@well-known-components/http-tracer-component'
import { createLogComponent } from '@well-known-components/logger'
import { createMetricsComponent } from '@well-known-components/metrics'
import { createPgComponent } from '@well-known-components/pg-component'
import { createTracerComponent } from '@well-known-components/tracer-component'
import { createSchemaValidatorComponent } from '@dcl/schema-validator-component'
import { createTracedFetcherComponent } from '@dcl/traced-fetch-component'
import { createEnvStorageComponent } from './adapters/env-storage'
import { createPlayerStorageComponent } from './adapters/player-storage'
import { createWorldStorageComponent } from './adapters/world-storage'
import { createWorldsContentServerComponent } from './adapters/worlds-content-server'
import { getDbConnectionString } from './logic/utils'
import { createWorldPermissionComponent } from './logic/world-permission'
import { metricDeclarations } from './metrics'
import type { AppComponents, GlobalContext } from './types'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  const tracer = await createTracerComponent()
  const fetcher = await createTracedFetcherComponent({ tracer })
  const logs = await createLogComponent({ metrics, tracer })
  const server = await createServerComponent<GlobalContext>({ config, logs }, {})
  const statusChecks = await createStatusCheckComponent({ server, config })
  createHttpTracerComponent({ server, tracer })
  instrumentHttpServerWithRequestLogger({ server, logger: logs }, { verbosity: Verbosity.INFO })

  if (!metrics.registry) {
    throw new Error('Metrics registry is not initialized')
  }

  await instrumentHttpServerWithPromClientRegistry({ metrics, server, config, registry: metrics.registry })

  const schemaValidator = createSchemaValidatorComponent({ ensureJsonContentType: true })

  const pg = await createPgComponent(
    { logs, config, metrics },
    {
      migration: {
        databaseUrl: await getDbConnectionString({ config }),
        dir: resolve(__dirname, 'migrations'),
        migrationsTable: 'pgmigrations',
        ignorePattern: '.*\\.map',
        direction: 'up'
      }
    }
  )

  const worldStorage = createWorldStorageComponent({ pg })
  const playerStorage = createPlayerStorageComponent({ pg })
  const envStorage = createEnvStorageComponent({ pg })
  const worldsContentServer = await createWorldsContentServerComponent({ fetcher, config })
  const worldPermission = createWorldPermissionComponent({ worldsContentServer })

  return {
    fetcher,
    config,
    logs,
    server,
    statusChecks,
    metrics,
    pg,
    worldStorage,
    playerStorage,
    envStorage,
    worldsContentServer,
    worldPermission,
    schemaValidator
  }
}
