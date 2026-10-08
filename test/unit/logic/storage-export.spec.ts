import { randomBytes } from 'crypto'
import { gunzipSync } from 'zlib'
import type { IBaseComponent, IConfigComponent } from '@well-known-components/interfaces'
import { createConfigMockedComponent } from '@dcl/core-commons'
import { createStorageExportComponent } from '../../../src/logic/storage-export'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import {
  createExportJobsMockedComponent,
  createLogsMockedComponent,
  createPlayerStorageMockedComponent,
  createWorldStorageMockedComponent
} from '../../mocks/components'
import type { ExportJob, IExportJobsComponent } from '../../../src/adapters/export-jobs/types'
import type { IPlayerStorageComponent } from '../../../src/adapters/player-storage/types'
import type { IWorldStorageComponent } from '../../../src/adapters/world-storage/types'
import type { IStorageExportComponent } from '../../../src/logic/storage-export'
import type { PlayerExportRow, WorldExportRow } from '../../../src/utils/exportSerializers'

const TTL_SECONDS = 3600
const TIMEOUT_SECONDS = 900
const INTERVAL_MS = 1000
const START_OPTIONS: IBaseComponent.ComponentStartOptions = {
  started: () => true,
  live: () => true,
  getComponents: () => ({})
}

async function* fromRows<T>(rows: T[]): AsyncGenerator<T> {
  for (const row of rows) {
    yield await Promise.resolve(row)
  }
}

function buildJob(overrides: Partial<ExportJob> = {}): ExportJob {
  return {
    id: 'job-1',
    worldName: WORLD_NAMES.DEFAULT,
    placeId: PLACE_IDS.DEFAULT,
    requestedBy: ADDRESSES.OWNER,
    format: 'json',
    selection: { worldKeys: null, playerAddresses: null, playerKeys: null },
    status: 'running',
    sizeBytes: null,
    error: null,
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    expiresAt: null,
    ...overrides
  }
}

function buildConfig(values: Record<string, number>): jest.Mocked<IConfigComponent> {
  const config = createConfigMockedComponent() as jest.Mocked<IConfigComponent>
  config.requireNumber.mockImplementation(async (key: string) => values[key])
  return config
}

function storedContent(exportJobs: jest.Mocked<IExportJobsComponent>): string {
  return gunzipSync(exportJobs.markDone.mock.calls[0][1]).toString('utf8')
}

describe('Storage Export Component', () => {
  let exportJobs: jest.Mocked<IExportJobsComponent>
  let worldStorage: jest.Mocked<IWorldStorageComponent>
  let playerStorage: jest.Mocked<IPlayerStorageComponent>
  let config: jest.Mocked<IConfigComponent>
  let logError: jest.Mock
  let logWarn: jest.Mock
  let logs: ReturnType<typeof createLogsMockedComponent>
  let storageExport: IStorageExportComponent
  let worldRows: WorldExportRow[]
  let playerRows: PlayerExportRow[]

  beforeEach(async () => {
    exportJobs = createExportJobsMockedComponent()
    worldStorage = createWorldStorageMockedComponent()
    playerStorage = createPlayerStorageMockedComponent()
    config = buildConfig({
      EXPORT_JOB_TTL_SECONDS: TTL_SECONDS,
      EXPORT_MAX_SIZE_BYTES: 104857600,
      EXPORT_WORKER_INTERVAL_MS: INTERVAL_MS,
      EXPORT_JOB_TIMEOUT_SECONDS: TIMEOUT_SECONDS
    })
    logError = jest.fn()
    logWarn = jest.fn()
    logs = createLogsMockedComponent({ error: logError, warn: logWarn })
    worldRows = []
    playerRows = []
    exportJobs.deleteExpired.mockResolvedValue(0)
    exportJobs.failStale.mockResolvedValue(0)
    exportJobs.claimNext.mockResolvedValue(null)
    exportJobs.markDone.mockResolvedValue(true)
    exportJobs.markFailed.mockResolvedValue(true)
    worldStorage.streamSceneValues.mockImplementation(() => fromRows(worldRows))
    playerStorage.streamScenePlayerValues.mockImplementation(() => fromRows(playerRows))
    storageExport = await createStorageExportComponent({ exportJobs, worldStorage, playerStorage, config, logs })
  })

  afterEach(async () => {
    await storageExport.stop?.()
    jest.useRealTimers()
    jest.resetAllMocks()
  })

  describe('when processing the next job', () => {
    let result: boolean

    describe('and no job is pending', () => {
      beforeEach(async () => {
        result = await storageExport.processNextJob()
      })

      it('should delete expired jobs and fail stale ones before claiming', () => {
        expect(exportJobs.failStale).toHaveBeenCalledWith(TIMEOUT_SECONDS, TTL_SECONDS)
        expect(exportJobs.deleteExpired.mock.invocationCallOrder[0]).toBeLessThan(
          exportJobs.failStale.mock.invocationCallOrder[0]
        )
        expect(exportJobs.failStale.mock.invocationCallOrder[0]).toBeLessThan(
          exportJobs.claimNext.mock.invocationCallOrder[0]
        )
      })

      it('should resolve false', () => {
        expect(result).toBe(false)
      })
    })

    describe('and a json job is claimed', () => {
      let job: ExportJob

      beforeEach(async () => {
        job = buildJob({ format: 'json' })
        worldRows = [
          { key: 'a', value: '1' },
          { key: 'b', value: '{"x":"y"}' }
        ]
        playerRows = [{ player_address: '0xa', key: 'k', value: '"s"' }]
        exportJobs.claimNext.mockResolvedValueOnce(job)
        result = await storageExport.processNextJob()
      })

      it('should store the gzipped JSON export with the ttl', () => {
        expect(exportJobs.markDone).toHaveBeenCalledWith(job, expect.any(Buffer), TTL_SECONDS)
        expect(storedContent(exportJobs)).toBe(
          '{"world":[{"key":"a","value":1},{"key":"b","value":{"x":"y"}}],"players":[{"address":"0xa","key":"k","value":"s"}]}'
        )
      })

      it('should resolve true', () => {
        expect(result).toBe(true)
      })
    })

    describe('and a csv job is claimed', () => {
      let job: ExportJob

      beforeEach(async () => {
        job = buildJob({ format: 'csv' })
        worldRows = [{ key: 'a', value: '1' }]
        playerRows = [{ player_address: '0xa', key: 'k', value: '"s"' }]
        exportJobs.claimNext.mockResolvedValueOnce(job)
        result = await storageExport.processNextJob()
      })

      it('should store the gzipped CSV export with the ttl', () => {
        expect(exportJobs.markDone).toHaveBeenCalledWith(job, expect.any(Buffer), TTL_SECONDS)
        expect(storedContent(exportJobs)).toBe(
          'scope,player_address,key,value\r\nworld,,a,1\r\nplayer,0xa,k,"""s"""\r\n'
        )
      })

      it('should resolve true', () => {
        expect(result).toBe(true)
      })
    })

    describe('and the job selects everything', () => {
      beforeEach(async () => {
        exportJobs.claimNext.mockResolvedValueOnce(
          buildJob({ selection: { worldKeys: null, playerAddresses: null, playerKeys: null } })
        )
        await storageExport.processNextJob()
      })

      it('should stream all world values of the scene', () => {
        expect(worldStorage.streamSceneValues).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, null)
      })

      it('should stream all player values of the scene', () => {
        expect(playerStorage.streamScenePlayerValues).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, {
          addresses: null,
          keys: null
        })
      })
    })

    describe('and the job selects specific keys and addresses', () => {
      beforeEach(async () => {
        exportJobs.claimNext.mockResolvedValueOnce(
          buildJob({ selection: { worldKeys: ['a'], playerAddresses: ['0xa'], playerKeys: ['k'] } })
        )
        await storageExport.processNextJob()
      })

      it('should pass the world keys through unchanged', () => {
        expect(worldStorage.streamSceneValues).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, ['a'])
      })

      it('should pass the player addresses and keys through unchanged', () => {
        expect(playerStorage.streamScenePlayerValues).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT, {
          addresses: ['0xa'],
          keys: ['k']
        })
      })
    })

    describe('and the job selects no world keys', () => {
      beforeEach(async () => {
        worldRows = [{ key: 'a', value: '1' }]
        exportJobs.claimNext.mockResolvedValueOnce(
          buildJob({ selection: { worldKeys: [], playerAddresses: null, playerKeys: null } })
        )
        await storageExport.processNextJob()
      })

      it('should not open a world stream', () => {
        expect(worldStorage.streamSceneValues).not.toHaveBeenCalled()
      })

      it('should export an empty world list', () => {
        expect(JSON.parse(storedContent(exportJobs)).world).toEqual([])
      })
    })

    describe.each([
      ['addresses', { worldKeys: null, playerAddresses: [], playerKeys: null }],
      ['keys', { worldKeys: null, playerAddresses: null, playerKeys: [] }]
    ])('and the job selects no player %s', (_description, selection) => {
      beforeEach(async () => {
        playerRows = [{ player_address: '0xa', key: 'k', value: '1' }]
        exportJobs.claimNext.mockResolvedValueOnce(buildJob({ selection }))
        await storageExport.processNextJob()
      })

      it('should not open a player stream', () => {
        expect(playerStorage.streamScenePlayerValues).not.toHaveBeenCalled()
      })

      it('should export an empty players list', () => {
        expect(JSON.parse(storedContent(exportJobs)).players).toEqual([])
      })
    })

    describe('and the gzipped export exceeds the maximum size', () => {
      let job: ExportJob
      let worldStreamClosed: boolean
      let cappedExport: IStorageExportComponent

      beforeEach(async () => {
        job = buildJob()
        worldStreamClosed = false
        worldStorage.streamSceneValues.mockImplementation(async function* () {
          try {
            for (let index = 0; index < 1000; index++) {
              yield await Promise.resolve({
                key: `k${index}`,
                value: JSON.stringify(randomBytes(2048).toString('hex'))
              })
            }
          } finally {
            worldStreamClosed = true
          }
        })
        exportJobs.claimNext.mockResolvedValueOnce(job)
        cappedExport = await createStorageExportComponent({
          exportJobs,
          worldStorage,
          playerStorage,
          config: buildConfig({
            EXPORT_JOB_TTL_SECONDS: TTL_SECONDS,
            EXPORT_MAX_SIZE_BYTES: 20,
            EXPORT_WORKER_INTERVAL_MS: INTERVAL_MS,
            EXPORT_JOB_TIMEOUT_SECONDS: TIMEOUT_SECONDS
          }),
          logs
        })
        result = await cappedExport.processNextJob()
      })

      it('should mark the job failed as too large', () => {
        expect(exportJobs.markFailed).toHaveBeenCalledWith(job, 'Export exceeds maximum size', TTL_SECONDS)
      })

      it('should not store any content', () => {
        expect(exportJobs.markDone).not.toHaveBeenCalled()
      })

      it('should close the world stream before it is exhausted', () => {
        expect(worldStreamClosed).toBe(true)
      })

      it('should resolve true', () => {
        expect(result).toBe(true)
      })
    })

    describe('and reading the storage fails', () => {
      let job: ExportJob

      beforeEach(async () => {
        job = buildJob()
        worldStorage.streamSceneValues.mockImplementation(async function* () {
          yield await Promise.reject(new Error('connection lost'))
        })
        exportJobs.claimNext.mockResolvedValueOnce(job)
        result = await storageExport.processNextJob()
      })

      it('should mark the job failed with a generic error', () => {
        expect(exportJobs.markFailed).toHaveBeenCalledWith(job, 'Export failed', TTL_SECONDS)
      })

      it('should log the error message with the job id', () => {
        expect(logError).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ jobId: job.id, error: 'connection lost' })
        )
      })

      it('should resolve true', () => {
        expect(result).toBe(true)
      })
    })

    describe('and the job was failed before it finished', () => {
      let job: ExportJob

      beforeEach(async () => {
        job = buildJob()
        exportJobs.claimNext.mockResolvedValueOnce(job)
        exportJobs.markDone.mockResolvedValueOnce(false)
        result = await storageExport.processNextJob()
      })

      it('should log a warning with the job id', () => {
        expect(logWarn).toHaveBeenCalledWith('Export job finished after it was failed', { jobId: job.id })
      })

      it('should not mark the job failed', () => {
        expect(exportJobs.markFailed).not.toHaveBeenCalled()
      })

      it('should resolve true', () => {
        expect(result).toBe(true)
      })
    })
  })

  describe('when the worker is started', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] })
    })

    describe('and the interval has not elapsed yet', () => {
      beforeEach(async () => {
        await storageExport.start?.(START_OPTIONS)
        await jest.advanceTimersByTimeAsync(INTERVAL_MS - 1)
      })

      it('should not run a tick', () => {
        expect(exportJobs.claimNext).not.toHaveBeenCalled()
      })
    })

    describe('and the interval elapses', () => {
      beforeEach(async () => {
        await storageExport.start?.(START_OPTIONS)
        await jest.advanceTimersByTimeAsync(INTERVAL_MS)
      })

      it('should run one tick', () => {
        expect(exportJobs.claimNext).toHaveBeenCalledTimes(1)
      })
    })

    describe('and a tick processes a job', () => {
      beforeEach(async () => {
        const markDoneCalled = new Promise<void>(resolve => {
          exportJobs.markDone.mockImplementationOnce(async () => {
            resolve()
            return true
          })
        })
        exportJobs.claimNext.mockResolvedValueOnce(buildJob())
        await storageExport.start?.(START_OPTIONS)
        await jest.advanceTimersByTimeAsync(INTERVAL_MS)
        await markDoneCalled
        await jest.advanceTimersByTimeAsync(0)
      })

      it('should run the next tick without waiting for the interval', () => {
        expect(exportJobs.claimNext).toHaveBeenCalledTimes(2)
      })
    })

    describe('and a tick fails', () => {
      beforeEach(async () => {
        exportJobs.deleteExpired.mockRejectedValueOnce(new Error('database down'))
        await storageExport.start?.(START_OPTIONS)
        await jest.advanceTimersByTimeAsync(INTERVAL_MS)
        await jest.advanceTimersByTimeAsync(INTERVAL_MS)
      })

      it('should log the error', () => {
        expect(logError).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ error: 'database down' }))
      })

      it('should still schedule the next tick', () => {
        expect(exportJobs.deleteExpired).toHaveBeenCalledTimes(2)
      })
    })

    describe('and it is stopped while a tick is in flight', () => {
      let releaseClaim: () => void
      let stopResolvedBeforeRelease: boolean
      let released: boolean

      beforeEach(async () => {
        stopResolvedBeforeRelease = false
        released = false
        exportJobs.claimNext.mockReturnValueOnce(
          new Promise(resolve => {
            releaseClaim = () => resolve(null)
          })
        )
        await storageExport.start?.(START_OPTIONS)
        await jest.advanceTimersByTimeAsync(INTERVAL_MS)
        const stopping = storageExport.stop?.().then(() => {
          stopResolvedBeforeRelease = !released
        })
        await jest.advanceTimersByTimeAsync(0)
        released = true
        releaseClaim()
        await stopping
        await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3)
      })

      it('should wait for the in-flight tick before resolving', () => {
        expect(stopResolvedBeforeRelease).toBe(false)
      })

      it('should not run further ticks', () => {
        expect(exportJobs.claimNext).toHaveBeenCalledTimes(1)
      })
    })

    describe('and it is stopped before the first tick', () => {
      beforeEach(async () => {
        await storageExport.start?.(START_OPTIONS)
        await storageExport.stop?.()
        await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3)
      })

      it('should never run a tick', () => {
        expect(exportJobs.claimNext).not.toHaveBeenCalled()
      })
    })
  })

  describe('when the worker is stopped without being started', () => {
    let stopping: Promise<void> | undefined

    beforeEach(() => {
      stopping = storageExport.stop?.()
    })

    it('should resolve without error', async () => {
      await expect(stopping).resolves.toBeUndefined()
    })
  })
})
