import { randomBytes } from 'crypto'
import { createExportJobsComponent } from '../../../src/adapters/export-jobs'
import { test } from '../../components'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import type {
  CreateExportJobResult,
  ExportJob,
  ExportJobScope,
  ExportSelection,
  IExportJobsComponent
} from '../../../src/adapters/export-jobs'

const ALL: ExportSelection = { worldKeys: null, playerAddresses: null, playerKeys: null }

function selectionWithKey(key: string): ExportSelection {
  return { worldKeys: [key], playerAddresses: null, playerKeys: null }
}

function jobOf(result: CreateExportJobResult): ExportJob {
  if (result.kind !== 'job') {
    throw new Error('Expected a job, got limit-reached')
  }
  return result.job
}

async function collect(stream: AsyncGenerator<Buffer>): Promise<Buffer[]> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

test('when persisting export jobs', function ({ components }) {
  let exportJobs: IExportJobsComponent
  let scope: ExportJobScope
  let otherSignerScope: ExportJobScope
  let otherSceneScope: ExportJobScope

  beforeEach(async () => {
    exportJobs = await createExportJobsComponent({
      pg: components.pg,
      config: components.config,
      logs: components.logs
    })
    scope = { worldName: WORLD_NAMES.DEFAULT, placeId: PLACE_IDS.DEFAULT, requestedBy: ADDRESSES.OWNER }
    otherSignerScope = { ...scope, requestedBy: ADDRESSES.DEPLOYER }
    otherSceneScope = { ...scope, placeId: PLACE_IDS.SCENE_A }
  })

  afterEach(async () => {
    await components.pg.query('DELETE FROM export_jobs')
  })

  describe('and the same scope, format and selection are created twice', () => {
    let first: ExportJob
    let second: ExportJob

    beforeEach(async () => {
      first = jobOf(await exportJobs.create(scope, 'json', ALL))
      second = jobOf(await exportJobs.create(scope, 'json', ALL))
    })

    it('should return the same job', () => {
      expect(second.id).toBe(first.id)
    })
  })

  describe('and an equivalent selection is reordered and re-cased', () => {
    let first: ExportJob
    let second: ExportJob

    beforeEach(async () => {
      first = jobOf(
        await exportJobs.create(scope, 'csv', {
          worldKeys: ['b', 'a'],
          playerAddresses: ['0x1234567890ABCDEF1234567890ABCDEF12345678'],
          playerKeys: null
        })
      )
      second = jobOf(
        await exportJobs.create(scope, 'csv', {
          worldKeys: ['a', 'b', 'a'],
          playerAddresses: [ADDRESSES.PLAYER],
          playerKeys: null
        })
      )
    })

    it('should return the same job', () => {
      expect(second.id).toBe(first.id)
    })

    it('should store the canonical selection', () => {
      expect(first.selection).toEqual({ worldKeys: ['a', 'b'], playerAddresses: [ADDRESSES.PLAYER], playerKeys: null })
    })
  })

  describe('and the format differs', () => {
    let first: ExportJob
    let second: ExportJob

    beforeEach(async () => {
      first = jobOf(await exportJobs.create(scope, 'json', ALL))
      second = jobOf(await exportJobs.create(scope, 'csv', ALL))
    })

    it('should create a new job', () => {
      expect(second.id).not.toBe(first.id)
    })
  })

  describe('and the selection differs', () => {
    let first: ExportJob
    let second: ExportJob

    beforeEach(async () => {
      first = jobOf(await exportJobs.create(scope, 'json', ALL))
      second = jobOf(await exportJobs.create(scope, 'json', selectionWithKey('score')))
    })

    it('should create a new job', () => {
      expect(second.id).not.toBe(first.id)
    })
  })

  describe('and the signer already has 3 pending jobs', () => {
    let fourth: CreateExportJobResult

    beforeEach(async () => {
      for (const key of ['a', 'b', 'c']) {
        await exportJobs.create(scope, 'json', selectionWithKey(key))
      }
    })

    describe('and a 4th distinct selection is created', () => {
      beforeEach(async () => {
        fourth = await exportJobs.create(scope, 'json', selectionWithKey('d'))
      })

      it('should return limit-reached', () => {
        expect(fourth).toEqual({ kind: 'limit-reached' })
      })
    })

    describe('and one of them is marked done', () => {
      beforeEach(async () => {
        const claimed = await exportJobs.claimNext()
        await exportJobs.markDone(claimed as ExportJob, Buffer.from('file'), 3600)
        fourth = await exportJobs.create(scope, 'json', selectionWithKey('d'))
      })

      it('should create the 4th job', () => {
        expect(fourth.kind).toBe('job')
      })
    })

    describe('and one of them is marked failed', () => {
      beforeEach(async () => {
        const claimed = await exportJobs.claimNext()
        await exportJobs.markFailed(claimed as ExportJob, 'boom', 3600)
        fourth = await exportJobs.create(scope, 'json', selectionWithKey('d'))
      })

      it('should create the 4th job', () => {
        expect(fourth.kind).toBe('job')
      })
    })

    describe('and one of them expires and is deleted', () => {
      beforeEach(async () => {
        const claimed = await exportJobs.claimNext()
        await exportJobs.markDone(claimed as ExportJob, Buffer.from('file'), 0)
        await exportJobs.deleteExpired()
        fourth = await exportJobs.create(scope, 'json', selectionWithKey('d'))
      })

      it('should create the 4th job', () => {
        expect(fourth.kind).toBe('job')
      })
    })

    describe('and another signer creates a job', () => {
      beforeEach(async () => {
        fourth = await exportJobs.create(otherSignerScope, 'json', selectionWithKey('d'))
      })

      it('should not be limited by the first signer', () => {
        expect(fourth.kind).toBe('job')
      })
    })
  })

  describe('and 6 distinct selections are created concurrently', () => {
    let results: CreateExportJobResult[]
    let pendingRows: number

    beforeEach(async () => {
      results = await Promise.all(
        ['a', 'b', 'c', 'd', 'e', 'f'].map(key => exportJobs.create(scope, 'json', selectionWithKey(key)))
      )
      const count = await components.pg.query<{ pending: number }>(
        "SELECT count(*)::int AS pending FROM export_jobs WHERE status = 'pending'"
      )
      pendingRows = count.rows[0].pending
    })

    it('should create exactly 3 jobs and limit the other 3', () => {
      expect(results.map(result => result.kind).sort()).toEqual([
        'job',
        'job',
        'job',
        'limit-reached',
        'limit-reached',
        'limit-reached'
      ])
    })

    it('should leave exactly 3 pending rows', () => {
      expect(pendingRows).toBe(3)
    })
  })

  describe('and 5 identical creates run concurrently', () => {
    let ids: Set<string>

    beforeEach(async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => exportJobs.create(scope, 'json', ALL)))
      ids = new Set(results.map(result => jobOf(result).id))
    })

    it('should return a single job', () => {
      expect(ids.size).toBe(1)
    })
  })

  describe('and a job with the same selection is done and not expired', () => {
    let done: ExportJob
    let repeated: ExportJob

    beforeEach(async () => {
      jobOf(await exportJobs.create(scope, 'json', ALL))
      done = (await exportJobs.claimNext()) as ExportJob
      await exportJobs.markDone(done, Buffer.from('file'), 3600)
      repeated = jobOf(await exportJobs.create(scope, 'json', ALL))
    })

    it('should return the done job', () => {
      expect(repeated).toMatchObject({ id: done.id, status: 'done', sizeBytes: 4 })
    })
  })

  describe('and a job with the same selection is done but already expired', () => {
    let expired: ExportJob
    let repeated: ExportJob

    beforeEach(async () => {
      jobOf(await exportJobs.create(scope, 'json', ALL))
      expired = (await exportJobs.claimNext()) as ExportJob
      await exportJobs.markDone(expired, Buffer.from('file'), 0)
      repeated = jobOf(await exportJobs.create(scope, 'json', ALL))
    })

    it('should create a new job', () => {
      expect(repeated.id).not.toBe(expired.id)
    })
  })

  describe('and a job with the same selection failed', () => {
    let failed: ExportJob
    let repeated: ExportJob

    beforeEach(async () => {
      jobOf(await exportJobs.create(scope, 'json', ALL))
      failed = (await exportJobs.claimNext()) as ExportJob
      await exportJobs.markFailed(failed, 'boom', 3600)
      repeated = jobOf(await exportJobs.create(scope, 'json', ALL))
    })

    it('should create a new job', () => {
      expect(repeated.id).not.toBe(failed.id)
    })
  })

  describe('and several jobs are pending', () => {
    let oldest: ExportJob
    let claimed: ExportJob | null

    beforeEach(async () => {
      oldest = jobOf(await exportJobs.create(scope, 'json', selectionWithKey('a')))
      await exportJobs.create(scope, 'json', selectionWithKey('b'))
      claimed = await exportJobs.claimNext()
    })

    it('should claim the oldest job as running', () => {
      expect(claimed).toMatchObject({ id: oldest.id, status: 'running' })
    })
  })

  describe('and two workers claim a single pending job concurrently', () => {
    let pending: ExportJob
    let claims: Array<ExportJob | null>

    beforeEach(async () => {
      pending = jobOf(await exportJobs.create(scope, 'json', ALL))
      claims = await Promise.all([exportJobs.claimNext(), exportJobs.claimNext()])
    })

    it('should give the job to exactly one of them', () => {
      expect(claims.map(claim => claim?.id ?? null).sort()).toEqual([pending.id, null].sort())
    })
  })

  describe('and a done job holds a 2.5 MiB file', () => {
    let content: Buffer
    let job: ExportJob

    beforeEach(async () => {
      content = randomBytes(2.5 * 1024 * 1024)
      jobOf(await exportJobs.create(scope, 'json', ALL))
      job = (await exportJobs.claimNext()) as ExportJob
      await exportJobs.markDone(job, content, 3600)
    })

    describe('and its own signer streams it', () => {
      let chunks: Buffer[]

      beforeEach(async () => {
        chunks = await collect(exportJobs.streamContent(scope, job.id))
      })

      it('should yield 3 chunks', () => {
        expect(chunks).toHaveLength(3)
      })

      it('should yield the stored file', () => {
        expect(Buffer.concat(chunks).equals(content)).toBe(true)
      })
    })

    describe('and another scene streams it', () => {
      let chunks: Buffer[]

      beforeEach(async () => {
        chunks = await collect(exportJobs.streamContent(otherSceneScope, job.id))
      })

      it('should yield nothing', () => {
        expect(chunks).toEqual([])
      })
    })

    describe('and another signer streams it', () => {
      let chunks: Buffer[]

      beforeEach(async () => {
        chunks = await collect(exportJobs.streamContent(otherSignerScope, job.id))
      })

      it('should yield nothing', () => {
        expect(chunks).toEqual([])
      })
    })
  })

  describe('and a job that is not done is streamed', () => {
    let chunks: Buffer[]

    beforeEach(async () => {
      const pending = jobOf(await exportJobs.create(scope, 'json', ALL))
      chunks = await collect(exportJobs.streamContent(scope, pending.id))
    })

    it('should yield nothing', () => {
      expect(chunks).toEqual([])
    })
  })

  describe('and a running job is past the timeout', () => {
    let running: ExportJob
    let failedCount: number
    let stored: ExportJob | null
    let lateDone: boolean

    beforeEach(async () => {
      jobOf(await exportJobs.create(scope, 'json', ALL))
      running = (await exportJobs.claimNext()) as ExportJob
      failedCount = await exportJobs.failStale(0, 3600)
      stored = await exportJobs.getForScene(scope, running.id)
      lateDone = await exportJobs.markDone(running, Buffer.from('file'), 3600)
    })

    it('should fail the job as timed out', () => {
      expect({ failedCount, stored }).toMatchObject({
        failedCount: 1,
        stored: { status: 'failed', error: 'Export timed out' }
      })
    })

    it('should reject a later markDone', () => {
      expect(lateDone).toBe(false)
    })
  })

  describe('and a job expires immediately on completion', () => {
    let listed: ExportJob[]
    let deleted: number
    let remainingRows: number

    beforeEach(async () => {
      jobOf(await exportJobs.create(scope, 'json', ALL))
      const job = (await exportJobs.claimNext()) as ExportJob
      await exportJobs.markDone(job, Buffer.from('file'), 0)
      listed = await exportJobs.listForScene(scope)
      deleted = await exportJobs.deleteExpired()
      const count = await components.pg.query<{ total: number }>('SELECT count(*)::int AS total FROM export_jobs')
      remainingRows = count.rows[0].total
    })

    it('should not list the expired job', () => {
      expect(listed).toEqual([])
    })

    it('should delete the expired row', () => {
      expect({ deleted, remainingRows }).toEqual({ deleted: 1, remainingRows: 0 })
    })
  })

  describe('and the signer lists the scene jobs', () => {
    let older: ExportJob
    let newer: ExportJob
    let listed: ExportJob[]

    beforeEach(async () => {
      older = jobOf(await exportJobs.create(scope, 'json', selectionWithKey('a')))
      newer = jobOf(await exportJobs.create(scope, 'json', selectionWithKey('b')))
      await exportJobs.create(otherSignerScope, 'json', ALL)
      listed = await exportJobs.listForScene(scope)
    })

    it('should list only their own jobs, newest first', () => {
      expect(listed.map(job => job.id)).toEqual([newer.id, older.id])
    })
  })
})
