import { createConfigMockedComponent } from '@dcl/core-commons'
import type { IPgComponent } from '@dcl/pg-component'
import { createExportJobsComponent } from '../../../src/adapters/export-jobs'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import { createLogsMockedComponent, createPgMockedComponent } from '../../mocks/components'
import type {
  CreateExportJobResult,
  ExportJob,
  ExportJobScope,
  ExportSelection,
  IExportJobsComponent
} from '../../../src/adapters/export-jobs'
import type { SQLStatement } from 'sql-template-strings'

const ONE_MIB = 1024 * 1024

function statementAt(pg: jest.Mocked<IPgComponent>, index: number): SQLStatement {
  return pg.query.mock.calls[index][0] as SQLStatement
}

function reuseQueryValues(pg: jest.Mocked<IPgComponent>): unknown[][] {
  return pg.query.mock.calls
    .map(([statement]) => statement as SQLStatement)
    .filter(statement => statement.text.includes('selection ='))
    .map(statement => statement.values)
}

async function collect(stream: AsyncGenerator<Buffer>): Promise<Buffer[]> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('ExportJobsComponent', () => {
  let pg: jest.Mocked<IPgComponent>
  let exportJobs: IExportJobsComponent
  let scope: ExportJobScope
  let selection: ExportSelection
  let jobId: string
  let createdAt: Date
  let row: Record<string, unknown>
  let expectedJob: ExportJob

  beforeEach(async () => {
    scope = { worldName: WORLD_NAMES.DEFAULT, placeId: PLACE_IDS.DEFAULT, requestedBy: ADDRESSES.OWNER }
    selection = { worldKeys: ['score'], playerAddresses: null, playerKeys: null }
    jobId = '0b3c1b7e-8f2a-4d5c-9e6f-1a2b3c4d5e6f'
    createdAt = new Date('2026-01-01T00:00:00.000Z')
    row = {
      id: jobId,
      world_name: scope.worldName,
      place_id: scope.placeId,
      requested_by: scope.requestedBy,
      format: 'json',
      selection,
      status: 'pending',
      content: Buffer.from('secret'),
      size_bytes: null,
      error: null,
      created_at: createdAt,
      started_at: null,
      completed_at: null,
      expires_at: null
    }
    expectedJob = {
      id: jobId,
      worldName: scope.worldName,
      placeId: scope.placeId,
      requestedBy: scope.requestedBy,
      format: 'json',
      selection,
      status: 'pending',
      sizeBytes: null,
      error: null,
      createdAt,
      startedAt: null,
      completedAt: null,
      expiresAt: null
    }

    pg = createPgMockedComponent()
    const limits: Record<string, number> = {
      EXPORT_MAX_ACTIVE_JOBS_PER_SIGNER: 3,
      EXPORT_MAX_ACTIVE_JOBS_PER_SCENE: 6,
      EXPORT_MAX_SCENE_STORED_BYTES: 10
    }
    const config = createConfigMockedComponent({
      requireNumber: jest.fn().mockImplementation(async (key: string) => limits[key])
    })
    exportJobs = await createExportJobsComponent({ pg, config, logs: createLogsMockedComponent() })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when creating an export job', () => {
    let result: CreateExportJobResult

    describe('and a reusable job exists', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never)
        result = await exportJobs.create(scope, 'json', selection)
      })

      it('should return the reusable job', () => {
        expect(result).toEqual({ kind: 'job', job: expectedJob })
      })

      it('should neither count the active jobs nor insert a new one', () => {
        expect(pg.query).toHaveBeenCalledTimes(2)
      })
    })

    describe('and the signer already has the maximum number of active jobs', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ signer_active: 3, scene_active: 3 }], rowCount: 1 } as never)
        result = await exportJobs.create(scope, 'json', selection)
      })

      it('should return limit-reached', () => {
        expect(result).toEqual({ kind: 'limit-reached' })
      })

      it('should not insert a new job', () => {
        expect(pg.query).toHaveBeenCalledTimes(3)
      })
    })

    describe('and the scene already has the maximum number of active jobs across signers', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ signer_active: 0, scene_active: 6 }], rowCount: 1 } as never)
        result = await exportJobs.create(scope, 'json', selection)
      })

      it('should return limit-reached', () => {
        expect(result).toEqual({ kind: 'limit-reached' })
      })

      it('should not insert a new job', () => {
        expect(pg.query).toHaveBeenCalledTimes(3)
      })
    })

    describe('and there is no reusable job and the signer is below the cap', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ signer_active: 2, scene_active: 5 }], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never)
        result = await exportJobs.create(scope, 'json', selection)
      })

      it('should return the inserted job', () => {
        expect(result).toEqual({ kind: 'job', job: expectedJob })
      })

      it('should insert a pending job', () => {
        expect(statementAt(pg, 3).text).toContain('INSERT INTO export_jobs')
      })
    })

    describe('and the queries run', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValue({ rows: [row], rowCount: 1 } as never)
        await exportJobs.create(scope, 'json', selection)
      })

      it('should run them inside an async context transaction', () => {
        expect(pg.withAsyncContextTransaction).toHaveBeenCalledTimes(1)
      })

      it('should take the advisory lock for the scene first', () => {
        expect(statementAt(pg, 0).text).toContain('pg_advisory_xact_lock(hashtextextended(')
        expect(statementAt(pg, 0).values).toEqual([`export-jobs:${scope.worldName}:${scope.placeId}`])
      })
    })

    describe('and the transaction does not run its callback', () => {
      beforeEach(async () => {
        pg.withAsyncContextTransaction.mockResolvedValueOnce({ kind: 'limit-reached' })
        await exportJobs.create(scope, 'json', selection)
      })

      it('should not query outside the transaction', () => {
        expect(pg.query).not.toHaveBeenCalled()
      })
    })

    describe('and two selections differ only in order, duplicates and address casing', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValue({ rows: [row], rowCount: 1 } as never)
        await exportJobs.create(scope, 'json', {
          worldKeys: ['b', 'a', 'a'],
          playerAddresses: ['0xAB'],
          playerKeys: null
        })
        await exportJobs.create(scope, 'json', { worldKeys: ['a', 'b'], playerAddresses: ['0xab'], playerKeys: null })
      })

      it('should compare both against the same canonical selection', () => {
        const [first, second] = reuseQueryValues(pg)
        expect(second).toEqual(first)
      })
    })

    describe('and three selections all exclude every player row', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValue({ rows: [row], rowCount: 1 } as never)
        await exportJobs.create(scope, 'json', { worldKeys: ['a'], playerAddresses: [], playerKeys: null })
        await exportJobs.create(scope, 'json', { worldKeys: ['a'], playerAddresses: null, playerKeys: [] })
        await exportJobs.create(scope, 'json', { worldKeys: ['a'], playerAddresses: ['0xab'], playerKeys: [] })
      })

      it('should compare all of them against the same canonical selection', () => {
        const [first, second, third] = reuseQueryValues(pg)
        expect([second, third]).toEqual([first, first])
      })
    })
  })

  describe('when streaming the content of a job', () => {
    let chunks: Buffer[]

    describe('and the content spans several chunks', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [{ chunk: Buffer.alloc(ONE_MIB, 1) }], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ chunk: Buffer.alloc(ONE_MIB, 2) }], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ chunk: Buffer.alloc(10, 3) }], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ chunk: Buffer.alloc(10, 4) }], rowCount: 1 } as never)
        chunks = await collect(exportJobs.streamContent(scope, jobId))
      })

      it('should yield every chunk up to the first one shorter than 1 MiB', () => {
        expect(chunks.map(chunk => chunk.length)).toEqual([ONE_MIB, ONE_MIB, 10])
      })

      it('should stop querying after the short chunk', () => {
        expect(pg.query).toHaveBeenCalledTimes(3)
      })
    })

    describe('and the job is not visible', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
        chunks = await collect(exportJobs.streamContent(scope, jobId))
      })

      it('should yield nothing', () => {
        expect(chunks).toEqual([])
      })
    })

    describe('and the id is not a uuid', () => {
      beforeEach(async () => {
        chunks = await collect(exportJobs.streamContent(scope, 'not-a-uuid'))
      })

      it('should yield nothing without querying', () => {
        expect(chunks).toEqual([])
        expect(pg.query).not.toHaveBeenCalled()
      })
    })
  })

  describe('when marking a job as done', () => {
    let job: ExportJob
    let content: Buffer

    beforeEach(() => {
      job = { ...expectedJob, status: 'running' }
      content = Buffer.from('file')
    })

    describe('and storing the content would exceed the scene budget', () => {
      let result: string

      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ stored: 7 }], rowCount: 1 } as never)
        result = await exportJobs.markDone(job, content, 3600)
      })

      it('should return over-budget', () => {
        expect(result).toBe('over-budget')
      })

      it('should not store the content', () => {
        expect(pg.query).toHaveBeenCalledTimes(2)
      })
    })

    describe('and the job is no longer running', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ stored: 0 }], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      })

      it('should return stale', async () => {
        expect(await exportJobs.markDone(job, content, 3600)).toBe('stale')
      })
    })

    describe('and the job is still running within the scene budget', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [{ stored: 6 }], rowCount: 1 } as never)
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      })

      it('should return done', async () => {
        expect(await exportJobs.markDone(job, content, 3600)).toBe('done')
      })

      it('should take the scene advisory lock inside a transaction first', async () => {
        await exportJobs.markDone(job, content, 3600)
        expect(statementAt(pg, 0).values).toEqual([`export-jobs:${job.worldName}:${job.placeId}`])
      })
    })
  })

  describe('when marking a job as failed', () => {
    let job: ExportJob
    let error: string

    beforeEach(() => {
      job = { ...expectedJob, status: 'running' }
      error = 'boom'
    })

    describe('and the job is no longer running', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      })

      it('should return false', async () => {
        expect(await exportJobs.markFailed(job, error, 3600)).toBe(false)
      })
    })

    describe('and the job is still running', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
      })

      it('should return true', async () => {
        expect(await exportJobs.markFailed(job, error, 3600)).toBe(true)
      })
    })
  })

  describe('when getting a job for a scene', () => {
    let result: ExportJob | null

    describe('and the id is not a uuid', () => {
      beforeEach(async () => {
        result = await exportJobs.getForScene(scope, 'not-a-uuid')
      })

      it('should return null', () => {
        expect(result).toBeNull()
      })

      it('should not query the database', () => {
        expect(pg.query).not.toHaveBeenCalled()
      })
    })

    describe('and the job exists', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never)
        result = await exportJobs.getForScene(scope, jobId)
      })

      it('should map the row into a camelCase job carrying the selection', () => {
        expect(result).toEqual(expectedJob)
      })

      it('should not expose the content', () => {
        expect(result).not.toHaveProperty('content')
      })
    })

    describe('and the job does not exist', () => {
      beforeEach(async () => {
        pg.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
        result = await exportJobs.getForScene(scope, jobId)
      })

      it('should return null', () => {
        expect(result).toBeNull()
      })
    })
  })
})
