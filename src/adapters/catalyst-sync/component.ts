import { SQL } from 'sql-template-strings'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { EntityType } from '@dcl/schemas'
import { errorMessageOrDefault } from '../../utils/errors'
import { UPSTREAM_FETCH_OPTIONS, discardResponseBody } from '../../utils/upstreamFetch'
import type { ICatalystSyncComponent } from './types'
import type { AppComponents } from '../../types'
import type { WorldScene } from '../worlds-content-server/types'

const CURSOR_NAME = 'catalyst-pointer-changes'
const GENESIS_WORLD_NAME = 'main'
const SNAPSHOT_FETCH_OPTIONS = { ...UPSTREAM_FETCH_OPTIONS, timeout: 30_000 }

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null
}

interface SceneChangeItem {
  entityId: string
  pointers: string[]
}

interface PointerChangeItem extends SceneChangeItem {
  localTimestamp: number
}

interface SnapshotMetadata {
  hash: string
  endTimestamp: number
}

function parseSceneChangeItem(value: unknown): SceneChangeItem | null {
  if (!isRecord(value)) {
    return null
  }

  const { entityId, entityType, pointers } = value

  if (typeof entityId !== 'string' || entityId.length === 0) {
    return null
  }

  if (entityType !== EntityType.SCENE) {
    return null
  }

  if (!Array.isArray(pointers) || pointers.length === 0 || !pointers.every(pointer => typeof pointer === 'string')) {
    return null
  }

  return { entityId, pointers }
}

function parsePointerChangeItem(value: unknown): PointerChangeItem | null {
  const item = parseSceneChangeItem(value)
  const localTimestamp = isRecord(value) ? value.localTimestamp : undefined

  if (!item || typeof localTimestamp !== 'number' || !Number.isFinite(localTimestamp)) {
    return null
  }

  return { ...item, localTimestamp }
}

function parseSnapshotMetadata(value: unknown): SnapshotMetadata | null {
  if (!isRecord(value)) {
    return null
  }

  const { hash, timeRange } = value

  if (typeof hash !== 'string' || hash.length === 0) {
    return null
  }

  if (!isRecord(timeRange) || typeof timeRange.endTimestamp !== 'number') {
    return null
  }

  return { hash, endTimestamp: timeRange.endTimestamp }
}

function parseSceneLines(text: string): SceneChangeItem[] {
  const items: SceneChangeItem[] = []

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }

    const item = parseSceneChangeItem(parsed)
    if (item) {
      items.push(item)
    }
  }

  return items
}

/**
 * Creates the catalyst sync component: a long-lived poller that keeps
 * `scene_logs_access` current for Genesis City scenes by consuming catalyst's
 * `/pointer-changes` from a persisted cursor, with a one-time `/snapshots` bootstrap
 * when no cursor exists yet.
 *
 * `/pointer-changes` and `/snapshots` are untrusted ingestion data: every item's shape
 * is validated before use, a malformed item is skipped, and a failed fetch never aborts
 * the poll loop (the next tick retries).
 *
 * @param components - Required components: config, logs, fetcher, pg, catalystContent,
 * sceneLogsAccess
 * @returns Promise resolving to ICatalystSyncComponent implementation
 */
export async function createCatalystSyncComponent(
  components: Pick<AppComponents, 'config' | 'logs' | 'fetcher' | 'pg' | 'catalystContent' | 'sceneLogsAccess'>
): Promise<ICatalystSyncComponent> {
  const { config, logs, fetcher, pg, catalystContent, sceneLogsAccess } = components
  const logger = logs.getLogger('catalyst-sync')

  const contentUrl = (await config.requireString('CONTENT_URL')).replace(/\/$/, '')
  const pollIntervalSeconds = (await config.getNumber('CATALYST_POLL_INTERVAL_SECONDS')) ?? 60

  let intervalHandle: NodeJS.Timeout | undefined
  let cursor: string | null = null

  async function getCursor(): Promise<string | null> {
    const result = await pg.query<{ cursor: string | null }>(
      SQL`SELECT cursor FROM sync_cursor WHERE name = ${CURSOR_NAME}`
    )
    return result.rows[0]?.cursor ?? null
  }

  async function saveCursor(cursor: string): Promise<void> {
    await pg.query(SQL`
      INSERT INTO sync_cursor (name, cursor, updated_at)
      VALUES (${CURSOR_NAME}, ${cursor}, current_timestamp)
      ON CONFLICT (name) DO UPDATE SET cursor = ${cursor}, updated_at = current_timestamp`)
  }

  async function processSceneChange(item: SceneChangeItem): Promise<void> {
    let scene: WorldScene | null

    try {
      scene = await catalystContent.getActiveSceneEntity(item.pointers[0])
    } catch (error) {
      logger.warn('Failed to resolve active scene entity for a scene change; skipping item', {
        entityId: item.entityId,
        parcel: item.pointers[0],
        error: errorMessageOrDefault(error)
      })
      return
    }

    if (!scene) {
      await sceneLogsAccess.removeScene(item.entityId)
      return
    }

    await sceneLogsAccess.upsertForScene({
      sceneId: scene.sceneId,
      worldName: GENESIS_WORLD_NAME,
      baseParcel: scene.base,
      title: scene.title,
      realmKind: 'genesis',
      addresses: scene.logsPermissions
    })
  }

  async function processSnapshotFile(hash: string): Promise<void> {
    const url = `${contentUrl}/contents/${encodeURIComponent(hash)}`

    let response: Awaited<ReturnType<typeof fetcher.fetch>>
    try {
      response = await fetcher.fetch(url, SNAPSHOT_FETCH_OPTIONS)
    } catch (error) {
      logger.warn('Failed to download snapshot file: network error', { hash, url, error: errorMessageOrDefault(error) })
      return
    }

    if (!response.ok) {
      await discardResponseBody(response)
      logger.warn('Failed to download snapshot file: non-OK response', { hash, url, status: response.status })
      return
    }

    let text: string
    try {
      text = await response.text()
    } catch (error) {
      logger.warn('Failed to read snapshot file body', { hash, url, error: errorMessageOrDefault(error) })
      return
    }

    for (const item of parseSceneLines(text)) {
      await processSceneChange(item)
    }
  }

  async function bootstrap(): Promise<void> {
    logger.info('Running one-time catalyst snapshots bootstrap')

    const url = `${contentUrl}/snapshots`

    let response: Awaited<ReturnType<typeof fetcher.fetch>>
    try {
      response = await fetcher.fetch(url, UPSTREAM_FETCH_OPTIONS)
    } catch (error) {
      logger.error('Failed to fetch snapshots: network error', { url, error: errorMessageOrDefault(error) })
      return
    }

    if (!response.ok) {
      await discardResponseBody(response)
      logger.error('Failed to fetch snapshots: non-OK response', { url, status: response.status })
      return
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      logger.error('Failed to parse snapshots response', { url, error: errorMessageOrDefault(error) })
      return
    }

    if (!Array.isArray(body)) {
      logger.error('Catalyst snapshots response has an unexpected shape', { url })
      return
    }

    let maxEndTimestamp = 0
    for (const raw of body) {
      const snapshot = parseSnapshotMetadata(raw)
      if (!snapshot) {
        logger.debug('Skipping malformed snapshot metadata entry')
        continue
      }

      maxEndTimestamp = Math.max(maxEndTimestamp, snapshot.endTimestamp)
      await processSnapshotFile(snapshot.hash)
    }

    cursor = String(maxEndTimestamp || Date.now())
    await saveCursor(cursor)
    logger.info('Catalyst snapshots bootstrap completed')
  }

  async function poll(): Promise<void> {
    try {
      const fromParam = cursor ?? '0'
      const url = `${contentUrl}/pointer-changes?from=${encodeURIComponent(fromParam)}&entityType=scene&sortingField=local_timestamp&sortingOrder=ASC`

      let response: Awaited<ReturnType<typeof fetcher.fetch>>
      try {
        response = await fetcher.fetch(url, UPSTREAM_FETCH_OPTIONS)
      } catch (error) {
        logger.warn('Failed to fetch pointer changes: network error', { url, error: errorMessageOrDefault(error) })
        return
      }

      if (!response.ok) {
        await discardResponseBody(response)
        logger.warn('Failed to fetch pointer changes: non-OK response', { url, status: response.status })
        return
      }

      let body: unknown
      try {
        body = await response.json()
      } catch (error) {
        logger.warn('Failed to parse pointer changes response', { url, error: errorMessageOrDefault(error) })
        return
      }

      const deltas = isRecord(body) ? body.deltas : undefined
      if (!Array.isArray(deltas)) {
        logger.warn('Catalyst pointer-changes response has an unexpected shape', { url })
        return
      }

      let maxTimestamp: number | null = null
      for (const raw of deltas) {
        const item = parsePointerChangeItem(raw)
        if (!item) {
          logger.debug('Skipping malformed pointer-changes item')
          continue
        }

        await processSceneChange(item)
        maxTimestamp = maxTimestamp === null ? item.localTimestamp : Math.max(maxTimestamp, item.localTimestamp)
      }

      if (maxTimestamp !== null) {
        cursor = String(maxTimestamp)
        await saveCursor(cursor)
      }
    } catch (error) {
      logger.error('Unexpected error during pointer-changes poll', { error: errorMessageOrDefault(error) })
    }
  }

  async function start(): Promise<void> {
    cursor = await getCursor()
    if (!cursor) {
      await bootstrap()
    }

    await poll()

    intervalHandle = setInterval(() => {
      poll().catch(error =>
        logger.error('Unhandled error in catalyst-sync poll loop', { error: errorMessageOrDefault(error) })
      )
    }, pollIntervalSeconds * 1000)
    intervalHandle.unref()
  }

  async function stop(): Promise<void> {
    if (intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = undefined
    }
  }

  return {
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop
  }
}
