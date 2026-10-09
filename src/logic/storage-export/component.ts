import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { errorMessageOrDefault } from '../../utils/errors'
import { serializeCsvExport, serializeJsonExport } from '../../utils/exportSerializers'
import type { IStorageExportComponent } from './types'
import type { ExportJob } from '../../adapters/export-jobs/types'
import type { AppComponents } from '../../types'

class ExportTooLargeError extends Error {
  constructor() {
    super('Export exceeds maximum size')
  }
}

async function* noRows<T>(): AsyncGenerator<T> {
  yield* []
}

/**
 * Creates the export worker: a per-pod loop that claims pending export jobs one at a time and
 * stores each as a gzipped JSON or CSV file capped at `EXPORT_MAX_SIZE_BYTES`.
 *
 * @param components - Export job store, storage adapters, config and logs
 * @returns The worker component, whose `start`/`stop` drive the claim loop
 */
export async function createStorageExportComponent({
  exportJobs,
  worldStorage,
  playerStorage,
  config,
  logs
}: Pick<
  AppComponents,
  'exportJobs' | 'worldStorage' | 'playerStorage' | 'config' | 'logs'
>): Promise<IStorageExportComponent> {
  const logger = logs.getLogger('storage-export')
  const jobTtlSeconds = await config.requireNumber('EXPORT_JOB_TTL_SECONDS')
  const maxSizeBytes = await config.requireNumber('EXPORT_MAX_SIZE_BYTES')
  const intervalMs = await config.requireNumber('EXPORT_WORKER_INTERVAL_MS')
  const jobTimeoutSeconds = await config.requireNumber('EXPORT_JOB_TIMEOUT_SECONDS')

  let timer: NodeJS.Timeout | undefined
  let stopped = false
  let inFlight: Promise<void> | undefined

  async function buildExport({ worldName, placeId, format, selection }: ExportJob): Promise<Buffer> {
    const serialize = format === 'csv' ? serializeCsvExport : serializeJsonExport
    const world =
      selection.worldKeys !== null && selection.worldKeys.length === 0
        ? noRows<{ key: string; value: string }>()
        : worldStorage.streamSceneValues(worldName, placeId, selection.worldKeys)
    const skipPlayers = selection.playerAddresses?.length === 0 || selection.playerKeys?.length === 0

    const chunks: Buffer[] = []
    let sizeBytes = 0
    const collector = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length
        if (sizeBytes > maxSizeBytes) {
          callback(new ExportTooLargeError())
          return
        }
        chunks.push(chunk)
        callback()
      }
    })

    await pipeline(
      Readable.from(
        serialize(
          world,
          skipPlayers
            ? noRows()
            : playerStorage.streamScenePlayerValues(worldName, placeId, {
                addresses: selection.playerAddresses,
                keys: selection.playerKeys
              })
        )
      ),
      createGzip(),
      collector
    )
    return Buffer.concat(chunks)
  }

  async function processNextJob(): Promise<boolean> {
    await exportJobs.deleteExpired()
    await exportJobs.failStale(jobTimeoutSeconds, jobTtlSeconds)
    const job = await exportJobs.claimNext()
    if (!job) {
      return false
    }

    const logContext = { jobId: job.id, worldName: job.worldName, placeId: job.placeId }
    try {
      const content = await buildExport(job)
      const stored = await exportJobs.markDone(job, content, jobTtlSeconds)
      if (stored === 'done') {
        logger.info('Export job done', { ...logContext, sizeBytes: content.length })
      } else if (stored === 'over-budget') {
        await exportJobs.markFailed(job, 'Export storage limit reached', jobTtlSeconds)
      } else {
        logger.warn('Export job finished after it was failed', { jobId: job.id })
      }
    } catch (error) {
      logger.error('Export job failed', { ...logContext, error: errorMessageOrDefault(error) })
      await exportJobs.markFailed(
        job,
        error instanceof ExportTooLargeError ? 'Export exceeds maximum size' : 'Export failed',
        jobTtlSeconds
      )
    }
    return true
  }

  function schedule(delayMs: number): void {
    timer = setTimeout(tick, delayMs)
  }

  function tick(): void {
    inFlight = (async () => {
      let processed = false
      try {
        processed = await processNextJob()
      } catch (error) {
        logger.error('Export worker tick failed', { error: errorMessageOrDefault(error) })
      }
      if (!stopped) {
        schedule(processed ? 0 : intervalMs)
      }
    })()
  }

  return {
    processNextJob,
    async start() {
      stopped = false
      schedule(intervalMs)
    },
    async stop() {
      stopped = true
      clearTimeout(timer)
      await inFlight
    }
  }
}
