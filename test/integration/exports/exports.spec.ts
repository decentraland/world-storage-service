import { randomUUID } from 'crypto'
import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import { TEST_REALM_METADATA, createTestIdentityWithAddress } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

interface ExportFile {
  world: Array<{ key: string; value: unknown }>
  players: Array<{ address: string; key: string; value: unknown }>
}

const UNAUTHORIZED_BODY = {
  error: 'Not Authorized',
  message: 'Unauthorized: Signer is not authorized to perform operations on this world'
}

test('when exporting scene storage', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let identity: AuthIdentity
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

  async function exportJson(selection: object): Promise<ExportFile> {
    const exported = await postExport('?format=json', JSON.stringify(selection))
    if (exported.status !== 200) {
      throw new Error(`Expected the export to stream, got ${exported.status}`)
    }
    return JSON.parse(await exported.text())
  }

  function getAs(path: string) {
    return signedFetch(`${baseUrl}${path}`, { method: 'GET', identity, metadata: TEST_REALM_METADATA })
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

    it('should respond with a 400 and the allowed properties message', async () => {
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 400,
        body: { error: 'Bad request', message: 'Request body may only contain world and players' }
      })
    })
  })

  describe('and the owner requests a json export without a body', () => {
    let text: string

    beforeEach(async () => {
      response = await postExport('?format=json')
      text = await response.text()
    })

    it('should respond with a 200 and a gzipped json attachment', () => {
      expect({
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentEncoding: response.headers.get('content-encoding'),
        contentDisposition: response.headers.get('content-disposition'),
        cacheControl: response.headers.get('cache-control')
      }).toEqual({
        status: 200,
        contentType: expect.stringMatching(/^application\/json/),
        contentEncoding: 'gzip',
        contentDisposition: 'attachment; filename="storage-export.json"',
        cacheControl: 'no-store'
      })
    })

    it('should contain only the scene world and player rows', () => {
      expect(JSON.parse(text)).toEqual({
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

  describe('and the owner requests a csv export', () => {
    let text: string

    beforeEach(async () => {
      response = await postExport('?format=csv')
      text = await response.text()
    })

    it('should respond with a 200 and a gzipped csv attachment', () => {
      expect({
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentEncoding: response.headers.get('content-encoding'),
        contentDisposition: response.headers.get('content-disposition')
      }).toEqual({
        status: 200,
        contentType: expect.stringMatching(/^text\/csv/),
        contentEncoding: 'gzip',
        contentDisposition: 'attachment; filename="storage-export.csv"'
      })
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
    let file: ExportFile

    beforeEach(async () => {
      file = await exportJson({ world: { keys: ['b'] }, players: { addresses: [] } })
    })

    it('should export only that world key', () => {
      expect(file).toEqual({ world: [{ key: 'b', value: 'text, with "quotes"' }], players: [] })
    })
  })

  describe('and the owner exports a single player address and no world keys', () => {
    let file: ExportFile

    beforeEach(async () => {
      file = await exportJson({ world: { keys: [] }, players: { addresses: [ADDRESSES.PLAYER] } })
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

  describe('and a deployer requests an export', () => {
    beforeEach(async () => {
      const deployer = await createTestIdentityWithAddress()
      stubComponents.worldsContentServer.getPermissions.mockResolvedValue({
        owner: ADDRESSES.OWNER,
        permissions: { deployment: { type: 'allow-list', wallets: [deployer.address] } }
      })
      response = await postExport('?format=json', undefined, deployer.identity)
      await response.text()
    })

    it('should respond with a 200', () => {
      expect(response.status).toBe(200)
    })
  })

  describe('and a logs-access collaborator requests an export', () => {
    beforeEach(async () => {
      const collaborator = await createTestIdentityWithAddress()
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
          logsPermissions: [collaborator.address.toLowerCase()]
        }
      ])
      response = await postExport('?format=json', undefined, collaborator.identity)
      await response.text()
    })

    it('should respond with a 200', () => {
      expect(response.status).toBe(200)
    })
  })

  describe('and a stranger requests an export', () => {
    beforeEach(async () => {
      const stranger = await createTestIdentityWithAddress()
      stubComponents.worldsContentServer.getPermissions.mockResolvedValue({
        owner: ADDRESSES.OWNER,
        permissions: { deployment: { type: 'allow-list', wallets: [] } }
      })
      response = await postExport('?format=json', undefined, stranger.identity)
    })

    it('should respond with a 401 and an unauthorized message', async () => {
      expect({ status: response.status, body: await response.json() }).toEqual({
        status: 401,
        body: UNAUTHORIZED_BODY
      })
    })
  })

  describe('and the exports are listed', () => {
    beforeEach(async () => {
      response = await getAs('/exports')
    })

    it('should respond with a 405', () => {
      expect(response.status).toBe(405)
    })
  })

  describe.each([
    ['an export', (): string => `/exports/${randomUUID()}`],
    ['an export download', (): string => `/exports/${randomUUID()}/download`]
  ])('and %s is fetched by id', (_label, path) => {
    beforeEach(async () => {
      response = await getAs(path())
    })

    it('should respond with a 404', () => {
      expect(response.status).toBe(404)
    })
  })
})
