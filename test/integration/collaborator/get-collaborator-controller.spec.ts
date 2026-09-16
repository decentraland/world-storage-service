import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { ADDRESSES, PARCELS, WORLD_NAMES } from '../../fixtures'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'
import type { CollaboratorScene } from '../../../src/adapters/scene-collaborators/types'

test('when listing watchable scenes via GET /collaborator', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let identity: AuthIdentity
  let address: string

  beforeEach(async () => {
    await components.sceneCollaborators.removeByWorld(WORLD_NAMES.DEFAULT)
    const setup = await createTestSetup(components, stubComponents)
    signedFetch = setup.signedFetch
    baseUrl = setup.baseUrl
    identity = setup.identity
    address = setup.address
    resetStubs = setup.resetStubs
  })

  afterEach(async () => {
    resetStubs()
    await components.sceneCollaborators.removeByWorld(WORLD_NAMES.DEFAULT)
  })

  describe('and the request does not include an identity', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/collaborator`, { method: 'GET' })
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
      response = await signedFetch(`${baseUrl}/collaborator`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should respond with a 200 and an empty page', async () => {
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.data).toEqual([])
      expect(body.pagination).toEqual({ limit: expect.any(Number), offset: 0, total: 0 })
    })
  })

  describe('and the wallet has an accessible scene', () => {
    let scene: CollaboratorScene

    beforeEach(async () => {
      scene = {
        sceneId: 'bafkrei-collaborator-scene',
        worldName: WORLD_NAMES.DEFAULT,
        baseParcel: PARCELS.SCENE_A,
        title: 'Collaborator Scene',
        realmKind: 'world'
      }
      await components.sceneCollaborators.upsertForScene({ ...scene, deployedAt: 0, addresses: [address] })
    })

    it('should respond with a 200 and the scene the wallet may watch', async () => {
      const response = await signedFetch(`${baseUrl}/collaborator`, {
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
      await components.sceneCollaborators.upsertForScene({
        sceneId: 'bafkrei-other-scene',
        worldName: WORLD_NAMES.DEFAULT,
        baseParcel: PARCELS.SCENE_B,
        title: 'Other Scene',
        realmKind: 'world',
        deployedAt: 0,
        addresses: [ADDRESSES.OTHER]
      })
    })

    it('should not include scenes that belong to a different wallet', async () => {
      const response = await signedFetch(`${baseUrl}/collaborator`, {
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
      await components.sceneCollaborators.upsertForScene({
        sceneId: 'bafkrei-scene-1',
        worldName: WORLD_NAMES.DEFAULT,
        baseParcel: PARCELS.SCENE_A,
        title: 'Scene 1',
        realmKind: 'world',
        deployedAt: 0,
        addresses: [address]
      })
      await components.sceneCollaborators.upsertForScene({
        sceneId: 'bafkrei-scene-2',
        worldName: WORLD_NAMES.DEFAULT,
        baseParcel: PARCELS.SCENE_B,
        title: 'Scene 2',
        realmKind: 'world',
        deployedAt: 0,
        addresses: [address]
      })
    })

    it('should return only the requested page while reporting the full total', async () => {
      const response = await signedFetch(`${baseUrl}/collaborator?limit=1&offset=0`, {
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
