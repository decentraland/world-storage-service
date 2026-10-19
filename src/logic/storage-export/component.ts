import { Readable, Transform, pipeline } from 'node:stream'
import { createGzip } from 'node:zlib'
import { serializeCsvExport, serializeJsonExport } from '../../utils/exportSerializers'
import type { ExportFormat, ExportScene, ExportSelection, IStorageExportComponent, OpenExportResult } from './types'
import type { AppComponents } from '../../types'

class ExportTooLargeError extends Error {
  constructor() {
    super('Export exceeds maximum size')
  }
}

class ExportTimeoutError extends Error {
  constructor() {
    super('Export timed out')
  }
}

interface ExportLogContext extends Record<string, string | number> {
  worldName: string
  placeId: string
  format: ExportFormat
  rawBytes: number
  durationMs: number
}

async function* noRows<T>(): AsyncGenerator<T> {
  yield* []
}

/**
 * Creates the storage export component, which streams a scene's world and player storage as a gzipped
 * JSON or CSV file, at most `EXPORT_MAX_CONCURRENT_PER_SCENE` at a time per scene,
 * one start per scene every `EXPORT_SCENE_COOLDOWN_SECONDS`, and `EXPORT_MAX_CONCURRENT_PER_POD` in total on this pod, aborting a stream that runs past `EXPORT_TIMEOUT_SECONDS` or whose raw output passes `EXPORT_MAX_SIZE_BYTES`.
 *
 * @param components - Storage adapters, config and logs
 * @returns The storage export component
 */
export async function createStorageExportComponent({
  worldStorage,
  playerStorage,
  config,
  logs
}: Pick<AppComponents, 'worldStorage' | 'playerStorage' | 'config' | 'logs'>): Promise<IStorageExportComponent> {
  const logger = logs.getLogger('storage-export')
  const maxConcurrentPerScene = await config.requireNumber('EXPORT_MAX_CONCURRENT_PER_SCENE')
  const maxConcurrentPerPod = await config.requireNumber('EXPORT_MAX_CONCURRENT_PER_POD')
  const sceneCooldownMs = (await config.requireNumber('EXPORT_SCENE_COOLDOWN_SECONDS')) * 1000
  const timeoutSeconds = await config.requireNumber('EXPORT_TIMEOUT_SECONDS')
  const maxSizeBytes = await config.requireNumber('EXPORT_MAX_SIZE_BYTES')
  const openExportsByScene = new Map<string, number>()
  const lastStartByScene = new Map<string, number>()
  let openExportsOnPod = 0

  function serializeSelection(
    { worldName, placeId }: ExportScene,
    selection: ExportSelection,
    format: ExportFormat
  ): AsyncGenerator<string> {
    const serialize = format === 'csv' ? serializeCsvExport : serializeJsonExport
    const world =
      selection.worldKeys !== null && selection.worldKeys.length === 0
        ? noRows<{ key: string; value: string }>()
        : worldStorage.streamSceneValues(worldName, placeId, selection.worldKeys)
    const skipPlayers = selection.playerAddresses?.length === 0 || selection.playerKeys?.length === 0
    return serialize(
      world,
      skipPlayers
        ? noRows()
        : playerStorage.streamScenePlayerValues(worldName, placeId, {
            addresses: selection.playerAddresses,
            keys: selection.playerKeys
          })
    )
  }

  function release(sceneKey: string): void {
    openExportsOnPod -= 1
    const remaining = (openExportsByScene.get(sceneKey) ?? 0) - 1
    if (remaining > 0) {
      openExportsByScene.set(sceneKey, remaining)
    } else {
      openExportsByScene.delete(sceneKey)
    }
  }

  function logFailure(logContext: ExportLogContext, error: NodeJS.ErrnoException): void {
    if (error instanceof ExportTooLargeError) {
      logger.error('Export exceeded the maximum size', logContext)
    } else if (error instanceof ExportTimeoutError) {
      logger.error('Export timed out', logContext)
    } else {
      logger.error('Export failed', {
        ...logContext,
        error: error.message,
        ...(error.code ? { code: error.code } : {})
      })
    }
  }

  function openExport(scene: ExportScene, selection: ExportSelection, format: ExportFormat): OpenExportResult {
    const sceneKey = `${scene.worldName}:${scene.placeId}`
    const openExports = openExportsByScene.get(sceneKey) ?? 0
    if (openExports >= maxConcurrentPerScene) {
      return { kind: 'limit-reached', scope: 'scene' }
    }
    const cooldownLeftMs = (lastStartByScene.get(sceneKey) ?? 0) + sceneCooldownMs - Date.now()
    if (cooldownLeftMs > 0) {
      return { kind: 'cooldown', retryAfterSeconds: Math.ceil(cooldownLeftMs / 1000) }
    }
    if (openExportsOnPod >= maxConcurrentPerPod) {
      return { kind: 'limit-reached', scope: 'pod' }
    }

    const startedAt = Date.now()
    lastStartByScene.set(sceneKey, startedAt)
    setTimeout(() => {
      if (lastStartByScene.get(sceneKey) === startedAt) {
        lastStartByScene.delete(sceneKey)
      }
    }, sceneCooldownMs).unref()

    const source = Readable.from(serializeSelection(scene, selection, format))
    openExportsByScene.set(sceneKey, openExports + 1)
    openExportsOnPod += 1

    let sizeBytes = 0
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += Buffer.byteLength(chunk)
        if (sizeBytes > maxSizeBytes) {
          callback(new ExportTooLargeError())
          return
        }
        callback(null, chunk)
      }
    })
    const gzip = createGzip()
    const logContext = (): ExportLogContext => ({
      worldName: scene.worldName,
      placeId: scene.placeId,
      format,
      rawBytes: sizeBytes,
      durationMs: Date.now() - startedAt
    })
    let outcomeLogged = false
    const onFailure = (error: NodeJS.ErrnoException | null): void => {
      if (error && !outcomeLogged) {
        outcomeLogged = true
        logFailure(logContext(), error)
      }
    }
    pipeline(source, limiter, gzip, onFailure)
    gzip.on('error', onFailure)

    const timer = setTimeout(() => gzip.destroy(new ExportTimeoutError()), timeoutSeconds * 1000)
    gzip.once('close', () => {
      clearTimeout(timer)
      release(sceneKey)
      if (!outcomeLogged) {
        outcomeLogged = true
        logger.info(gzip.readableEnded ? 'Export finished' : 'Export cancelled by client', logContext())
      }
    })

    return { kind: 'stream', stream: gzip }
  }

  return { openExport }
}
