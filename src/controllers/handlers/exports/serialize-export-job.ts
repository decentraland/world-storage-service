import type { ExportFormat, ExportJob, ExportJobStatus, ExportSelection } from '../../../adapters/export-jobs'

/** Grouped request shape of a selection; a left-out field means all. */
export interface ExportSelectionBody {
  world?: { keys: string[] }
  players?: { addresses?: string[]; keys?: string[] }
}

/** Public representation of an export job, without its content. */
export interface SerializedExportJob {
  id: string
  status: ExportJobStatus
  format: ExportFormat
  selection: ExportSelectionBody
  createdAt: string
  completedAt: string | null
  expiresAt: string | null
  sizeBytes: number | null
  error: string | null
}

function toSelectionBody(selection: ExportSelection): ExportSelectionBody {
  const body: ExportSelectionBody = {}
  if (selection.worldKeys !== null) {
    body.world = { keys: selection.worldKeys }
  }
  if (selection.playerAddresses !== null || selection.playerKeys !== null) {
    body.players = {
      ...(selection.playerAddresses !== null && { addresses: selection.playerAddresses }),
      ...(selection.playerKeys !== null && { keys: selection.playerKeys })
    }
  }
  return body
}

/** Serializes an export job for HTTP responses. */
export function serializeExportJob(job: ExportJob): SerializedExportJob {
  return {
    id: job.id,
    status: job.status,
    format: job.format,
    selection: toSelectionBody(job.selection),
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    sizeBytes: job.sizeBytes,
    error: job.error
  }
}
