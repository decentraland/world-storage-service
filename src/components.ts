import { resolve } from 'path'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { Verbosity, instrumentHttpServerWithRequestLogger } from '@dcl/http-requests-logger-component'
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry
} from '@dcl/http-server'
import { createHttpTracerComponent } from '@dcl/http-tracer-component'
import { createInMemoryCacheComponent } from '@dcl/memory-cache-component'
import { createMetricsComponent } from '@dcl/metrics'
import { createPgComponent } from '@dcl/pg-component'
import { createSchemaValidatorComponent } from '@dcl/schema-validator-component'
import { createTracedFetcherComponent } from '@dcl/traced-fetch-component'
import { createTracerComponent } from '@dcl/tracer-component'
import { createEncryptionComponent } from './adapters/encryption'
import { createEnvStorageComponent } from './adapters/env-storage'
import { createPlacesComponent } from './adapters/places'
import { createPlayerStorageComponent } from './adapters/player-storage'
import { createWorldStorageComponent } from './adapters/world-storage'
import { createWorldsContentServerComponent } from './adapters/worlds-content-server'
import { createStorageLimitsComponent } from './logic/storage-limits'
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
  const corsOrigins = await config.requireString('CORS_ORIGINS')
  const cors = {
    origin: corsOrigins.split(';').map(pattern => new RegExp(pattern)),
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    maxAge: 86400
  }
  const server = await createServerComponent<GlobalContext>({ config, logs }, { cors })
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
      pool: {
        connectionString: await getDbConnectionString({ config })
      },
      migration: {
        dir: resolve(__dirname, 'migrations'),
        migrationsTable: 'pgmigrations',
        ignorePattern: '.*\\.map',
        direction: 'up'
      }
    }
  )

  const encryption = await createEncryptionComponent({ config, logs })

  // Dedicated cache for storage reads. `max` bounds the number of cached entries
  // (LRU) and the TTL bounds how long a stale read can survive on a replica that
  // did not handle the write (in-memory caches cannot be invalidated cross-instance).
  // The cache is count-capped, so worst-case memory ~= max * STORAGE_CACHE_MAX_VALUE_BYTES
  // (see .env.default); keep `max` sized for the container limit.
  const storageCacheMax = (await config.getNumber('STORAGE_CACHE_MAX')) ?? 8_000
  const storageCacheTtlSeconds = (await config.getNumber('STORAGE_CACHE_TTL_SECONDS')) ?? 60
  const storageCache = createInMemoryCacheComponent({
    max: storageCacheMax,
    ttl: storageCacheTtlSeconds * 1000
  })

  const worldStorage = await createWorldStorageComponent({ pg, config, storageCache, logs })
  const playerStorage = await createPlayerStorageComponent({ pg, config, storageCache, logs })
  const envStorage = createEnvStorageComponent({ pg, encryption, logs })
  const storageLimits = await createStorageLimitsComponent({ config, logs, worldStorage, playerStorage, envStorage })
  const worldsContentServer = await createWorldsContentServerComponent({ fetcher, config, logs })
  const worldPermission = createWorldPermissionComponent({ worldsContentServer, fetcher, config, logs })
  const cache = createInMemoryCacheComponent()
  const places = await createPlacesComponent({ fetcher, config, cache, logs })

  return {
    fetcher,
    config,
    logs,
    server,
    statusChecks,
    metrics,
    pg,
    encryption,
    storageLimits,
    worldStorage,
    playerStorage,
    envStorage,
    worldsContentServer,
    worldPermission,
    cache,
    storageCache,
    places,
    schemaValidator
  }
}
