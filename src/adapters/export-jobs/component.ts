import { randomUUID } from 'crypto'
import { SQL } from 'sql-template-strings'
import type {
  CreateExportJobResult,
  ExportFormat,
  ExportJob,
  ExportJobScope,
  ExportJobStatus,
  ExportSelection,
  IExportJobsComponent,
  MarkDoneResult
} from './types'
import type { AppComponents } from '../../types'
import type { SQLStatement } from 'sql-template-strings'

const CONTENT_CHUNK_BYTES = 1024 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JOB_COLUMNS = SQL`id, world_name, place_id, requested_by, format, selection, status, size_bytes, error, created_at, started_at, completed_at, expires_at`
const NOT_EXPIRED = SQL` AND (expires_at IS NULL OR expires_at > now())`

interface ExportJobRow {
  id: string
  world_name: string
  place_id: string
  requested_by: string
  format: ExportFormat
  selection: ExportSelection
  status: ExportJobStatus
  size_bytes: number | null
  error: string | null
  created_at: Date
  started_at: Date | null
  completed_at: Date | null
  expires_at: Date | null
}

function canonicalize(selection: ExportSelection): ExportSelection {
  const sorted = (list: string[] | null): string[] | null => (list === null ? null : [...new Set(list)].sort())
  const worldKeys = sorted(selection.worldKeys)
  const playerAddresses = sorted(selection.playerAddresses?.map(address => address.toLowerCase()) ?? null)
  const playerKeys = sorted(selection.playerKeys)
  if (playerAddresses?.length === 0 || playerKeys?.length === 0) {
    return { worldKeys, playerAddresses: [], playerKeys: [] }
  }
  return { worldKeys, playerAddresses, playerKeys }
}

function toExportJob(row: ExportJobRow): ExportJob {
  return {
    id: row.id,
    worldName: row.world_name,
    placeId: row.place_id,
    requestedBy: row.requested_by,
    format: row.format,
    selection: row.selection,
    status: row.status,
    sizeBytes: row.size_bytes,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at
  }
}

function scopeFilter({ worldName, placeId, requestedBy }: ExportJobScope): SQLStatement {
  return SQL`world_name = ${worldName} AND place_id = ${placeId}::uuid AND requested_by = ${requestedBy}`
}

function selectJobs(): SQLStatement {
  return SQL`SELECT `.append(JOB_COLUMNS).append(SQL` FROM export_jobs WHERE `)
}

/**
 * Creates the export jobs component, the Postgres store of export jobs and their gzipped content.
 *
 * @param components - Required components: pg (database), config, logs (logger)
 * @returns IExportJobsComponent implementation
 */
export const createExportJobsComponent = async ({
  pg,
  config,
  logs
}: Pick<AppComponents, 'pg' | 'config' | 'logs'>): Promise<IExportJobsComponent> => {
  const logger = logs.getLogger('export-jobs')
  const maxActiveJobsPerSigner = await config.requireNumber('EXPORT_MAX_ACTIVE_JOBS_PER_SIGNER')
  const maxActiveJobsPerScene = await config.requireNumber('EXPORT_MAX_ACTIVE_JOBS_PER_SCENE')
  const maxSceneStoredBytes = await config.requireNumber('EXPORT_MAX_SCENE_STORED_BYTES')

  async function withSceneLock<T>(worldName: string, placeId: string, operation: () => Promise<T>): Promise<T> {
    return pg.withAsyncContextTransaction(async (): Promise<T> => {
      await pg.query(SQL`SELECT pg_advisory_xact_lock(hashtextextended(${`export-jobs:${worldName}:${placeId}`}, 0))`)
      return operation()
    })
  }

  async function create(
    scope: ExportJobScope,
    format: ExportFormat,
    selection: ExportSelection
  ): Promise<CreateExportJobResult> {
    const { worldName, placeId, requestedBy } = scope
    const selectionJson = JSON.stringify(canonicalize(selection))

    return withSceneLock(worldName, placeId, async (): Promise<CreateExportJobResult> => {
      const reusable = await pg.query<ExportJobRow>(
        selectJobs()
          .append(scopeFilter(scope))
          .append(
            SQL` AND format = ${format} AND selection = ${selectionJson}::jsonb AND (status IN ('pending','running') OR (status = 'done' AND expires_at > now())) ORDER BY created_at DESC LIMIT 1`
          )
      )
      if (reusable.rows[0]) {
        logger.debug('Reusing export job', { id: reusable.rows[0].id, worldName, placeId })
        return { kind: 'job', job: toExportJob(reusable.rows[0]) }
      }

      const active = await pg.query<{ signer_active: number; scene_active: number }>(
        SQL`SELECT count(*) FILTER (WHERE requested_by = ${requestedBy})::int AS signer_active, count(*)::int AS scene_active
          FROM export_jobs WHERE world_name = ${worldName} AND place_id = ${placeId}::uuid AND status IN ('pending','running')`
      )
      const { signer_active: signerActive, scene_active: sceneActive } = active.rows[0]
      if (signerActive >= maxActiveJobsPerSigner || sceneActive >= maxActiveJobsPerScene) {
        logger.info('Export job limit reached', { worldName, placeId, signerActive, sceneActive })
        return { kind: 'limit-reached' }
      }

      const inserted = await pg.query<ExportJobRow>(
        SQL`INSERT INTO export_jobs (id, world_name, place_id, requested_by, format, selection, status)
          VALUES (${randomUUID()}, ${worldName}, ${placeId}::uuid, ${requestedBy}, ${format}, ${selectionJson}::jsonb, 'pending')
          RETURNING `.append(JOB_COLUMNS)
      )
      logger.info('Export job created', { id: inserted.rows[0].id, worldName, placeId })
      return { kind: 'job', job: toExportJob(inserted.rows[0]) }
    })
  }

  async function getForScene(scope: ExportJobScope, id: string): Promise<ExportJob | null> {
    if (!UUID_PATTERN.test(id)) return null
    const result = await pg.query<ExportJobRow>(
      selectJobs()
        .append(SQL`id = ${id}::uuid AND `)
        .append(scopeFilter(scope))
        .append(NOT_EXPIRED)
    )
    return result.rows[0] ? toExportJob(result.rows[0]) : null
  }

  async function listForScene(scope: ExportJobScope): Promise<ExportJob[]> {
    const result = await pg.query<ExportJobRow>(
      selectJobs()
        .append(scopeFilter(scope))
        .append(NOT_EXPIRED)
        .append(SQL` ORDER BY created_at DESC`)
    )
    return result.rows.map(toExportJob)
  }

  async function* streamContent(scope: ExportJobScope, id: string): AsyncGenerator<Buffer> {
    if (!UUID_PATTERN.test(id)) return
    for (let offset = 0; ; offset += CONTENT_CHUNK_BYTES) {
      const result = await pg.query<{ chunk: Buffer | null }>(
        SQL`SELECT substring(content FROM ${offset + 1} FOR ${CONTENT_CHUNK_BYTES}) AS chunk FROM export_jobs WHERE id = ${id}::uuid AND `
          .append(scopeFilter(scope))
          .append(NOT_EXPIRED)
          .append(SQL` AND status = 'done'`)
      )
      const chunk = result.rows[0]?.chunk
      if (chunk && chunk.length > 0) yield chunk
      if (!chunk || chunk.length < CONTENT_CHUNK_BYTES) return
    }
  }

  async function claimNext(): Promise<ExportJob | null> {
    const result = await pg.query<ExportJobRow>(
      SQL`UPDATE export_jobs SET status = 'running', started_at = now()
        WHERE id = (SELECT id FROM export_jobs WHERE status = 'pending' ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING `.append(JOB_COLUMNS)
    )
    if (!result.rows[0]) return null
    const job = toExportJob(result.rows[0])
    logger.info('Export job claimed', { id: job.id, worldName: job.worldName, placeId: job.placeId })
    return job
  }

  async function markDone(job: ExportJob, content: Buffer, ttlSeconds: number): Promise<MarkDoneResult> {
    return withSceneLock(job.worldName, job.placeId, async (): Promise<MarkDoneResult> => {
      const stored = await pg.query<{ stored: number }>(
        SQL`SELECT coalesce(sum(size_bytes), 0)::float8 AS stored FROM export_jobs
          WHERE world_name = ${job.worldName} AND place_id = ${job.placeId}::uuid AND status = 'done' AND expires_at > now()`
      )
      if (stored.rows[0].stored + content.length > maxSceneStoredBytes) {
        logger.warn('Export storage budget reached', { id: job.id, worldName: job.worldName, placeId: job.placeId })
        return 'over-budget'
      }
      const result = await pg.query(
        SQL`UPDATE export_jobs SET status = 'done', content = ${content}, size_bytes = ${content.length},
          completed_at = now(), expires_at = now() + make_interval(secs => ${ttlSeconds})
          WHERE id = ${job.id}::uuid AND status = 'running'`
      )
      return result.rowCount === 1 ? 'done' : 'stale'
    })
  }

  async function markFailed(job: ExportJob, error: string, ttlSeconds: number): Promise<boolean> {
    const result = await pg.query(
      SQL`UPDATE export_jobs SET status = 'failed', error = ${error},
        completed_at = now(), expires_at = now() + make_interval(secs => ${ttlSeconds})
        WHERE id = ${job.id}::uuid AND status = 'running'`
    )
    return result.rowCount === 1
  }

  async function failStale(timeoutSeconds: number, ttlSeconds: number): Promise<number> {
    const result = await pg.query(
      SQL`UPDATE export_jobs SET status = 'failed', error = 'Export timed out',
        completed_at = now(), expires_at = now() + make_interval(secs => ${ttlSeconds})
        WHERE status = 'running' AND started_at < now() - make_interval(secs => ${timeoutSeconds})`
    )
    if (result.rowCount > 0) logger.warn('Failed stale export jobs', { count: result.rowCount })
    return result.rowCount
  }

  async function deleteExpired(): Promise<number> {
    const result = await pg.query(SQL`DELETE FROM export_jobs WHERE expires_at IS NOT NULL AND expires_at <= now()`)
    if (result.rowCount > 0) logger.info('Deleted expired export jobs', { count: result.rowCount })
    return result.rowCount
  }

  return { create, getForScene, listForScene, streamContent, claimNext, markDone, markFailed, failStale, deleteExpired }
}
