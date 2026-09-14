import { SQL } from 'sql-template-strings'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import { EntityType } from '@dcl/schemas'
import { isRecord } from '../../logic/scene-entity'
import { errorMessageOrDefault } from '../../utils/errors'
import { UPSTREAM_FETCH_OPTIONS, discardResponseBody } from '../../utils/upstreamFetch'
import type { ICatalystSyncComponent } from './types'
import type { AppComponents } from '../../types'

const CURSOR_NAME = 'catalyst-pointer-changes'
const GENESIS_WORLD_NAME = 'main'

interface PointerChangeItem {
  entityId: string
  pointers: string[]
  localTimestamp: number
}

function parsePointerChangeItem(value: unknown): PointerChangeItem | null {
  if (!isRecord(value)) {
    return null
  }

  const { entityId, entityType, pointers, localTimestamp } = value

  if (typeof entityId !== 'string' || entityId.length === 0) {
    return null
  }

  if (entityType !== EntityType.SCENE) {
    return null
  }

  if (!Array.isArray(pointers) || pointers.length === 0 || !pointers.every(pointer => typeof pointer === 'string')) {
    return null
  }

  if (typeof localTimestamp !== 'number' || !Number.isFinite(localTimestamp)) {
    return null
  }

  return { entityId, pointers, localTimestamp }
}

/**
 * Creates the catalyst sync component: a long-lived poller that keeps
 * `scene_logs_access` current for Genesis City scenes by consuming catalyst's
 * `/pointer-changes` from a persisted cursor. On first run (no cursor) it starts from
 * "now", so it only indexes scenes deployed from then on — like the Worlds consumer,
 * pre-existing scenes reach the index via the read-path write-through instead of a
 * historical backfill.
 *
 * `/pointer-changes` is untrusted ingestion data: every item's shape is validated before
 * use, a malformed item is skipped, and a failed fetch never aborts the poll loop.
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
  let polling = false

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

  async function processSceneChange(item: PointerChangeItem): Promise<void> {
    const scene = await catalystContent.getActiveSceneEntity(item.pointers[0])

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

  async function poll(): Promise<void> {
    if (polling) {
      logger.debug('Skipping catalyst poll: a previous poll is still running')
      return
    }
    polling = true

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

      let lastProcessedTimestamp: number | null = null
      for (const raw of deltas) {
        const item = parsePointerChangeItem(raw)
        if (!item) {
          logger.debug('Skipping malformed pointer-changes item')
          continue
        }

        try {
          await processSceneChange(item)
        } catch (error) {
          logger.warn('Failed to process a scene change; retrying from this item on the next poll', {
            entityId: item.entityId,
            parcel: item.pointers[0],
            error: errorMessageOrDefault(error)
          })
          break
        }

        lastProcessedTimestamp =
          lastProcessedTimestamp === null ? item.localTimestamp : Math.max(lastProcessedTimestamp, item.localTimestamp)
      }

      if (lastProcessedTimestamp !== null) {
        cursor = String(lastProcessedTimestamp)
        await saveCursor(cursor)
      }
    } catch (error) {
      logger.error('Unexpected error during pointer-changes poll', { error: errorMessageOrDefault(error) })
    } finally {
      polling = false
    }
  }

  async function start(): Promise<void> {
    cursor = await getCursor()
    if (cursor === null) {
      cursor = String(Date.now())
      await saveCursor(cursor)
    }

    void poll().catch(error =>
      logger.error('Unhandled error in catalyst-sync poll loop', { error: errorMessageOrDefault(error) })
    )

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
