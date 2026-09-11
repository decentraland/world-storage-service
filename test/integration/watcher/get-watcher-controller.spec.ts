import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { ADDRESSES, PARCELS, WORLD_NAMES } from '../../fixtures'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'
import type { WatcherScene } from '../../../src/adapters/scene-logs-access/types'

test('when listing watchable scenes via GET /watcher', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let identity: AuthIdentity
  let address: string

  beforeEach(async () => {
    await components.sceneLogsAccess.removeByWorld(WORLD_NAMES.DEFAULT)
    const setup = await createTestSetup(components, stubComponents)
    signedFetch = setup.signedFetch
    baseUrl = setup.baseUrl
    identity = setup.identity
    address = setup.address
    resetStubs = setup.resetStubs
  })

  afterEach(async () => {
    resetStubs()
    await components.sceneLogsAccess.removeByWorld(WORLD_NAMES.DEFAULT)
  })

  describe('and the request does not include an identity', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/watcher`, { method: 'GET' })
    })

    it('should respond with a 400 and a signed fetch required message', async () => {
      const body = await response.json()
      expect(response.status).toBe(400)
      expect(body).toEqual({
        error: 'Invalid Auth Chain',
        message: 'This endpoint requires a signed fetch request. See ADR-44.'
      })
    })
  })

  describe('and the wallet has no accessible scenes', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/watcher`, { method: 'GET', identity, metadata: TEST_REALM_METADATA })
    })

    it('should respond with a 200 and an empty page', async () => {
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.data).toEqual([])
      expect(body.pagination).toEqual({ limit: expect.any(Number), offset: 0, total: 0 })
    })
  })

  describe('and the wallet has an accessible scene', () => {
    let scene: WatcherScene

    beforeEach(async () => {
      scene = {
        sceneId: 'bafkrei-watcher-scene',
        worldName: WORLD_NAMES.DEFAULT,
        baseParcel: PARCELS.SCENE_A,
        title: 'Watcher Scene',
        realmKind: 'world'
      }
      await components.sceneLogsAccess.upsertForScene({ ...scene, addresses: [address] })
    })

    it('should respond with a 200 and the scene the wallet may watch', async () => {
      const response = await signedFetch(`${baseUrl}/watcher`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.data).toEqual([scene])
      expect(body.pagination.total).toBe(1)
    })
  })

  describe('and another wallet has an accessible scene', () => {
    beforeEach(async () => {
      await components.sceneLogsAccess.upsertForScene({
        sceneId: 'bafkrei-other-scene',
        worldName: WORLD_NAMES.DEFAULT,
        baseParcel: PARCELS.SCENE_B,
        title: 'Other Scene',
        realmKind: 'world',
        addresses: [ADDRESSES.OTHER]
      })
    })

    it('should not include scenes that belong to a different wallet', async () => {
      const response = await signedFetch(`${baseUrl}/watcher`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.data).toEqual([])
      expect(body.pagination.total).toBe(0)
    })
  })

  describe('and the wallet has more scenes than the requested page size', () => {
    beforeEach(async () => {
      await components.sceneLogsAccess.upsertForScene({
        sceneId: 'bafkrei-scene-1',
        worldName: WORLD_NAMES.DEFAULT,
        baseParcel: PARCELS.SCENE_A,
        title: 'Scene 1',
        realmKind: 'world',
        addresses: [address]
      })
      await components.sceneLogsAccess.upsertForScene({
        sceneId: 'bafkrei-scene-2',
        worldName: WORLD_NAMES.DEFAULT,
        baseParcel: PARCELS.SCENE_B,
        title: 'Scene 2',
        realmKind: 'world',
        addresses: [address]
      })
    })

    it('should return only the requested page while reporting the full total', async () => {
      const response = await signedFetch(`${baseUrl}/watcher?limit=1&offset=0`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.data).toHaveLength(1)
      expect(body.pagination).toEqual({ limit: 1, offset: 0, total: 2 })
    })
  })
})
