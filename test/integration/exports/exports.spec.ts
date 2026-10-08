import { randomBytes, randomUUID } from 'crypto'
import { gunzipSync } from 'zlib'
import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { createExportJobsComponent } from '../../../src/adapters/export-jobs'
import { test } from '../../components'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import { TEST_REALM_METADATA, createTestIdentityWithAddress } from '../utils/auth'
import { createTestSetup } from '../utils/setup'
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

interface ExportJobBody {
  id: string
  status: string
  format: string
  selection: Record<string, unknown>
  createdAt: string
  completedAt: string | null
  expiresAt: string | null
  sizeBytes: number | null
  error: string | null
}

interface ExportFile {
  world: Array<{ key: string; value: unknown }>
  players: Array<{ address: string; key: string; value: unknown }>
}

const SERIALIZED_JOB_FIELDS = [
  'completedAt',
  'createdAt',
  'error',
  'expiresAt',
  'format',
  'id',
  'selection',
  'sizeBytes',
  'status'
]

const UNAUTHORIZED_BODY = {
  error: 'Not Authorized',
  message: 'Unauthorized: Signer is not authorized to perform operations on this world'
}

const TOO_MANY_EXPORTS_BODY = {
  error: 'Too Many Requests',
  message: 'Too many exports in progress for this scene; wait for one to finish'
}

test('when exporting scene storage', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let identity: AuthIdentity
  let address: string
  let resetStubs: () => void
  let response: Awaited<ReturnType<typeof signedFetch>>

  function postExport(query: string, body?: string, signer: AuthIdentity = identity) {
    return signedFetch(`${baseUrl}/exports${query}`, {
      method: 'POST',
      identity: signer,
      metadata: TEST_REALM_METADATA,
      headers: { 'Content-Type': 'application/json' },
      body
    })
  }

  async function createExport(format: string, selection?: object, signer: AuthIdentity = identity): Promise<string> {
    const created = await postExport(`?format=${format}`, selection && JSON.stringify(selection), signer)
    if (created.status !== 202) {
      throw new Error(`Expected the export to be created, got ${created.status}`)
    }
    const body: { id: string } = await created.json()
    return body.id
  }

  function getAs(path: string, signer: AuthIdentity = identity) {
    return signedFetch(`${baseUrl}${path}`, { method: 'GET', identity: signer, metadata: TEST_REALM_METADATA })
  }

  async function fetchJob(id: string): Promise<ExportJobBody> {
    return (await getAs(`/exports/${id}`)).json()
  }

  async function downloadText(id: string, signer: AuthIdentity = identity): Promise<string> {
    const download = await getAs(`/exports/${id}/download`, signer)
    return gunzipSync(Buffer.from(await download.arrayBuffer())).toString('utf8')
  }

  async function put(path: string, value: unknown): Promise<void> {
    const stored = await signedFetch(`${baseUrl}${path}`, {
      method: 'PUT',
      identity,
      metadata: TEST_REALM_METADATA,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    })
    if (!stored.ok) {
      throw new Error(`Seeding ${path} failed with ${stored.status}`)
    }
  }

  beforeEach(async () => {
    const setup = await createTestSetup(components, stubComponents)
    signedFetch = setup.signedFetch
    baseUrl = setup.baseUrl
    identity = setup.identity
    address = setup.address
    resetStubs = setup.resetStubs

    await put('/values/a', { n: 1 })
    await put('/values/b', 'text, with "quotes"')
    for (const player of [ADDRESSES.PLAYER, ADDRESSES.OWNER]) {
      await put(`/players/${player}/values/k1`, { player, key: 'k1' })
      await put(`/players/${player}/values/k2`, { player, key: 'k2' })
    }
    await put('/env/secret', 'shh')
    await components.worldStorage.setValue(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A, 'other', '1')
  })

  afterEach(async () => {
    resetStubs()
    await components.pg.query('DELETE FROM export_jobs')
    await components.worldStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT)
    await components.worldStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.SCENE_A)
    await components.playerStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT)
    await components.envStorage.deleteAll(WORLD_NAMES.DEFAULT, PLACE_IDS.DEFAULT)
  })

  describe('and the request does not include an identity', () => {
    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/exports?format=json`, { method: 'POST' })
    })

    it('should respond with a 400 and a signed fetch required message', async () => {
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 400,
        body: { error: 'Invalid Auth Chain', message: 'This endpoint requires a signed fetch request. See ADR-44.' }
      })
    })
  })

  describe.each([
    ['not allowlisted', '?format=xml'],
    ['missing', '']
  ])('and the format is %s', (_label, query) => {
    beforeEach(async () => {
      response = await postExport(query)
    })

    it('should respond with a 400 and the allowed formats', async () => {
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 400,
        body: { error: 'Bad request', message: 'format must be one of: json, csv' }
      })
    })
  })

  describe('and the selection is empty', () => {
    beforeEach(async () => {
      response = await postExport('?format=json', '{"world":{"keys":[]},"players":{"addresses":[]}}')
    })

    it('should respond with a 400 and the empty selection message', async () => {
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 400,
        body: { error: 'Bad request', message: 'The selection is empty: nothing to export' }
      })
    })
  })

  describe('and the selection has an unknown property', () => {
    beforeEach(async () => {
      response = await postExport('?format=json', '{"extra":1}')
    })

    it('should respond with a 400', () => {
      expect(response.status).toBe(400)
    })
  })

  describe('and the owner requests a json export without a body', () => {
    let id: string

    beforeEach(async () => {
      response = await postExport('?format=json')
    })

    it('should respond with a 202 and a pending job', async () => {
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 202,
        body: { id: expect.any(String), status: 'pending' }
      })
    })

    describe('and the same export is requested again', () => {
      let repeatedId: string

      beforeEach(async () => {
        id = ((await response.json()) as { id: string }).id
        repeatedId = await createExport('json')
      })

      it('should return the same job', () => {
        expect(repeatedId).toBe(id)
      })
    })

    describe('and a csv export is requested', () => {
      let csvId: string

      beforeEach(async () => {
        id = ((await response.json()) as { id: string }).id
        csvId = await createExport('csv')
      })

      it('should create a different job', () => {
        expect(csvId).not.toBe(id)
      })
    })

    describe('and the export is downloaded before it is processed', () => {
      beforeEach(async () => {
        id = ((await response.json()) as { id: string }).id
        response = await getAs(`/exports/${id}/download`)
      })

      it('should respond with a 409 and a not ready message', async () => {
        expect({ status: response.status, body: await response.json() }).toEqual({
          status: 409,
          body: { error: 'Conflict', message: 'Export is not ready' }
        })
      })
    })

    describe('and the export is processed', () => {
      beforeEach(async () => {
        id = ((await response.json()) as { id: string }).id
        await components.storageExport.processNextJob()
      })

      describe('and the same export is requested again', () => {
        beforeEach(async () => {
          response = await postExport('?format=json')
        })

        it('should respond with a 202 and the same done job', async () => {
          expect({ status: response.status, body: await response.json() }).toEqual({
            status: 202,
            body: { id, status: 'done' }
          })
        })
      })

      describe('and the job is fetched', () => {
        let job: ExportJobBody

        beforeEach(async () => {
          response = await getAs(`/exports/${id}`)
          job = await response.json()
        })

        it('should respond with a 200 and the done job with a full selection', () => {
          expect({ status: response.status, job }).toEqual({
            status: 200,
            job: {
              id,
              status: 'done',
              format: 'json',
              selection: {},
              createdAt: expect.any(String),
              completedAt: expect.any(String),
              expiresAt: expect.any(String),
              sizeBytes: expect.any(Number),
              error: null
            }
          })
        })

        it('should report a non-empty file', () => {
          expect(job.sizeBytes).toBeGreaterThan(0)
        })
      })

      describe('and the file is downloaded', () => {
        let file: Buffer

        beforeEach(async () => {
          response = await getAs(`/exports/${id}/download`)
          file = Buffer.from(await response.arrayBuffer())
        })

        it('should respond with a 200 and a gzip attachment', () => {
          expect({
            status: response.status,
            contentType: response.headers.get('content-type'),
            contentDisposition: response.headers.get('content-disposition')
          }).toEqual({
            status: 200,
            contentType: 'application/gzip',
            contentDisposition: 'attachment; filename="storage-export.json.gz"'
          })
        })

        it('should contain only the scene world and player rows', () => {
          expect(JSON.parse(gunzipSync(file).toString('utf8'))).toEqual({
            world: [
              { key: 'a', value: { n: 1 } },
              { key: 'b', value: 'text, with "quotes"' }
            ],
            players: [
              { address: ADDRESSES.PLAYER, key: 'k1', value: { player: ADDRESSES.PLAYER, key: 'k1' } },
              { address: ADDRESSES.PLAYER, key: 'k2', value: { player: ADDRESSES.PLAYER, key: 'k2' } },
              { address: ADDRESSES.OWNER, key: 'k1', value: { player: ADDRESSES.OWNER, key: 'k1' } },
              { address: ADDRESSES.OWNER, key: 'k2', value: { player: ADDRESSES.OWNER, key: 'k2' } }
            ]
          })
        })
      })
    })
  })

  describe('and the owner requests the same world keys reordered and duplicated', () => {
    let first: string
    let second: string

    beforeEach(async () => {
      first = await createExport('json', { world: { keys: ['b', 'a'] } })
      second = await createExport('json', { world: { keys: ['a', 'b', 'a'] } })
    })

    it('should return the same job', () => {
      expect(second).toBe(first)
    })
  })

  describe('and the owner downloads a processed csv export', () => {
    let text: string

    beforeEach(async () => {
      const id = await createExport('csv')
      await components.storageExport.processNextJob()
      text = await downloadText(id)
    })

    it('should start with the csv header', () => {
      expect(text.startsWith('scope,player_address,key,value\r\n')).toBe(true)
    })

    it('should quote the world value and double its quotes', () => {
      expect(text).toContain('world,,b,"""text, with \\""quotes\\"""""')
    })

    it('should include the player rows', () => {
      expect(text).toContain(`player,${ADDRESSES.PLAYER},k1,`)
    })

    it('should not include env variables', () => {
      expect(text).not.toContain('secret')
    })
  })

  describe('and the owner exports a single world key and no players', () => {
    let id: string
    let file: ExportFile
    let job: ExportJobBody

    beforeEach(async () => {
      id = await createExport('json', { world: { keys: ['b'] }, players: { addresses: [] } })
      await components.storageExport.processNextJob()
      file = JSON.parse(await downloadText(id))
      job = await fetchJob(id)
    })

    it('should export only that world key', () => {
      expect(file).toEqual({ world: [{ key: 'b', value: 'text, with "quotes"' }], players: [] })
    })

    it('should echo the normalized selection', () => {
      expect(job.selection).toEqual({ world: { keys: ['b'] }, players: { addresses: [], keys: [] } })
    })
  })

  describe('and the owner exports a single player address and no world keys', () => {
    let file: ExportFile

    beforeEach(async () => {
      const id = await createExport('json', { world: { keys: [] }, players: { addresses: [ADDRESSES.PLAYER] } })
      await components.storageExport.processNextJob()
      file = JSON.parse(await downloadText(id))
    })

    it('should export only that player rows', () => {
      expect({ world: file.world, players: file.players.map(row => [row.address, row.key]) }).toEqual({
        world: [],
        players: [
          [ADDRESSES.PLAYER, 'k1'],
          [ADDRESSES.PLAYER, 'k2']
        ]
      })
    })
  })

  describe('and the owner exports a single player key and no world keys', () => {
    let file: ExportFile

    beforeEach(async () => {
      const id = await createExport('json', { world: { keys: [] }, players: { keys: ['k2'] } })
      await components.storageExport.processNextJob()
      file = JSON.parse(await downloadText(id))
    })

    it('should export that key for every player', () => {
      expect({ world: file.world, players: file.players.map(row => [row.address, row.key]) }).toEqual({
        world: [],
        players: [
          [ADDRESSES.PLAYER, 'k2'],
          [ADDRESSES.OWNER, 'k2']
        ]
      })
    })
  })

  describe('and the owner already has 3 exports in progress', () => {
    beforeEach(async () => {
      for (const key of ['a', 'b', 'c']) {
        await createExport('json', { world: { keys: [key] } })
      }
    })

    describe('and a 4th export is requested', () => {
      beforeEach(async () => {
        response = await postExport('?format=json', JSON.stringify({ world: { keys: ['d'] } }))
      })

      it('should respond with a 429 and a too many exports message', async () => {
        expect({ status: response.status, body: await response.json() }).toEqual({
          status: 429,
          body: TOO_MANY_EXPORTS_BODY
        })
      })
    })

    describe('and one export finishes before a 4th is requested', () => {
      beforeEach(async () => {
        await components.storageExport.processNextJob()
        response = await postExport('?format=json', JSON.stringify({ world: { keys: ['d'] } }))
      })

      it('should respond with a 202', () => {
        expect(response.status).toBe(202)
      })
    })
  })

  describe('and the owner lists exports after requesting two', () => {
    let first: string
    let second: string
    let jobs: ExportJobBody[]

    beforeEach(async () => {
      first = await createExport('json')
      second = await createExport('csv')
      response = await getAs('/exports')
      jobs = ((await response.json()) as { data: ExportJobBody[] }).data
    })

    it('should respond with a 200 and the jobs newest first', () => {
      expect({ status: response.status, ids: jobs.map(job => job.id) }).toEqual({ status: 200, ids: [second, first] })
    })

    it('should serialize each job without its content', () => {
      expect(jobs.map(job => Object.keys(job).sort())).toEqual([SERIALIZED_JOB_FIELDS, SERIALIZED_JOB_FIELDS])
    })
  })

  describe('and a deployer requests an export', () => {
    let deployer: AuthIdentity

    beforeEach(async () => {
      const deployerIdentity = await createTestIdentityWithAddress()
      deployer = deployerIdentity.identity
      stubComponents.worldsContentServer.getPermissions.mockResolvedValue({
        owner: ADDRESSES.OWNER,
        permissions: { deployment: { type: 'allow-list', wallets: [deployerIdentity.address] } }
      })
      const id = await createExport('json', undefined, deployer)
      await components.storageExport.processNextJob()
      response = await getAs(`/exports/${id}/download`, deployer)
    })

    it('should let the deployer download the file', () => {
      expect(response.status).toBe(200)
    })
  })

  describe('and a logs-access collaborator requests an export', () => {
    let collaborator: AuthIdentity
    let collaboratorJobId: string
    let jobs: ExportJobBody[]

    beforeEach(async () => {
      await createExport('json')
      const collaboratorIdentity = await createTestIdentityWithAddress()
      collaborator = collaboratorIdentity.identity
      stubComponents.worldsContentServer.getPermissions.mockResolvedValue({
        owner: ADDRESSES.OWNER,
        permissions: { deployment: { type: 'allow-list', wallets: [] } }
      })
      stubComponents.worldsContentServer.getScenesAtParcel.mockResolvedValue([
        {
          sceneId: 'bafkreiexportcollaborator',
          base: '0,0',
          parcels: ['0,0'],
          title: null,
          deployedAt: 0,
          logsPermissions: [collaboratorIdentity.address.toLowerCase()]
        }
      ])
      collaboratorJobId = await createExport('json', undefined, collaborator)
      response = await getAs('/exports', collaborator)
      jobs = ((await response.json()) as { data: ExportJobBody[] }).data
    })

    it('should respond with a 200 listing only the collaborator job', () => {
      expect({ status: response.status, ids: jobs.map(job => job.id) }).toEqual({
        status: 200,
        ids: [collaboratorJobId]
      })
    })
  })

  describe('and a stranger calls the export routes', () => {
    let stranger: AuthIdentity
    let ownerJobId: string

    beforeEach(async () => {
      ownerJobId = await createExport('json')
      stranger = (await createTestIdentityWithAddress()).identity
      stubComponents.worldsContentServer.getPermissions.mockResolvedValue({
        owner: ADDRESSES.OWNER,
        permissions: { deployment: { type: 'allow-list', wallets: [] } }
      })
    })

    describe.each([
      ['POST /exports', (): Promise<Response> => postExport('?format=json', undefined, stranger)],
      ['GET /exports', (): Promise<Response> => getAs('/exports', stranger)],
      ['GET /exports/:id', (): Promise<Response> => getAs(`/exports/${ownerJobId}`, stranger)],
      ['GET /exports/:id/download', (): Promise<Response> => getAs(`/exports/${ownerJobId}/download`, stranger)]
    ])('and the route is %s', (_label, send) => {
      beforeEach(async () => {
        response = await send()
      })

      it('should respond with a 401 and an unauthorized message', async () => {
        expect({ status: response.status, body: await response.json() }).toEqual({
          status: 401,
          body: UNAUTHORIZED_BODY
        })
      })
    })
  })

  describe.each([
    ['an unknown uuid', async (): Promise<string> => randomUUID()],
    ['not a uuid', async (): Promise<string> => 'not-a-uuid'],
    [
      'a job of another signer',
      async (): Promise<string> =>
        jobOf(
          await components.exportJobs.create(
            { worldName: WORLD_NAMES.DEFAULT, placeId: PLACE_IDS.DEFAULT, requestedBy: ADDRESSES.OWNER },
            'json',
            ALL
          )
        ).id
    ],
    [
      'a job of another place',
      async (): Promise<string> =>
        jobOf(
          await components.exportJobs.create(
            { worldName: WORLD_NAMES.DEFAULT, placeId: PLACE_IDS.SCENE_A, requestedBy: address.toLowerCase() },
            'json',
            ALL
          )
        ).id
    ]
  ])('and the requested job id is %s', (_label, resolveId) => {
    beforeEach(async () => {
      response = await getAs(`/exports/${await resolveId()}`)
    })

    it('should respond with a 404', () => {
      expect(response.status).toBe(404)
    })
  })
})
