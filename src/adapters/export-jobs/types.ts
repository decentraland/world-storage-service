/** Output file format of an export job. */
export type ExportFormat = 'json' | 'csv'

/** Lifecycle state of an export job. */
export type ExportJobStatus = 'pending' | 'running' | 'done' | 'failed'

/** Canonical export selection: `null` means all and `[]` means none. */
export interface ExportSelection {
  worldKeys: string[] | null
  playerAddresses: string[] | null
  playerKeys: string[] | null
}

/** An export job without its file content. */
export interface ExportJob {
  id: string
  worldName: string
  placeId: string
  requestedBy: string
  format: ExportFormat
  selection: ExportSelection
  status: ExportJobStatus
  sizeBytes: number | null
  error: string | null
  createdAt: Date
  startedAt: Date | null
  completedAt: Date | null
  expiresAt: Date | null
}

/** The scene and signer that own an export job. */
export interface ExportJobScope {
  worldName: string
  placeId: string
  requestedBy: string
}

/** Result of creating an export job: the reused or inserted job, or the in-flight cap. */
export type CreateExportJobResult = { kind: 'job'; job: ExportJob } | { kind: 'limit-reached' }

/** Persists export jobs, their selections and their gzipped content. */
export interface IExportJobsComponent {
  /** Returns an identical active job, `limit-reached` at the signer's in-flight cap, or a new pending job. */
  create(scope: ExportJobScope, format: ExportFormat, selection: ExportSelection): Promise<CreateExportJobResult>
  /** Returns the scope's non-expired job with this id, or null. */
  getForScene(scope: ExportJobScope, id: string): Promise<ExportJob | null>
  /** Lists the scope's non-expired jobs, newest first. */
  listForScene(scope: ExportJobScope): Promise<ExportJob[]>
  /** Yields the content of the scope's non-expired done job in 1 MiB chunks; yields nothing otherwise. */
  streamContent(scope: ExportJobScope, id: string): AsyncGenerator<Buffer>
  /** Moves the oldest pending job to running and returns it, or null when none is pending. */
  claimNext(): Promise<ExportJob | null>
  /** Stores the content of a running job and marks it done; false when the job is no longer running. */
  markDone(job: ExportJob, content: Buffer, ttlSeconds: number): Promise<boolean>
  /** Marks a running job failed; false when the job is no longer running. */
  markFailed(job: ExportJob, error: string, ttlSeconds: number): Promise<boolean>
  /** Fails every job running longer than the timeout and returns how many were failed. */
  failStale(timeoutSeconds: number, ttlSeconds: number): Promise<number>
  /** Deletes every expired job and returns how many were deleted. */
  deleteExpired(): Promise<number>
}
