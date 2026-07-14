import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { Authenticator } from '@dcl/crypto'
import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { PARCELS, WORLD_NAMES } from '../../fixtures'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('when getting an env storage value', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let resetStubs: () => void
  let key: string
  let identity: AuthIdentity

  beforeEach(async () => {
    key = 'MY_ENV_VAR'
    const setup = await createTestSetup(components, stubComponents)
    signedFetch = setup.signedFetch
    baseUrl = setup.baseUrl
    identity = setup.identity
    resetStubs = setup.resetStubs
  })

  afterEach(() => {
    resetStubs()
  })

  describe('and the request does not include an identity', () => {
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/env/${key}`, { method: 'GET' })
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

  describe('and the value does not exist', () => {
    beforeEach(async () => {
      await signedFetch(`${baseUrl}/env/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    it('should respond with a 404 and a not found message', async () => {
      const response = await signedFetch(`${baseUrl}/env/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(404)
      expect(body).toEqual({
        error: 'Not Found',
        message: 'Value not found'
      })
    })
  })

  describe('and the value exists', () => {
    let storedValue: string

    beforeEach(async () => {
      storedValue = 'secret-api-key-12345'
      await signedFetch(`${baseUrl}/env/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: storedValue }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    afterEach(async () => {
      await signedFetch(`${baseUrl}/env/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    it('should respond with a 200 and the stored value', async () => {
      const response = await signedFetch(`${baseUrl}/env/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        value: storedValue
      })
    })
  })

  describe('and the stored value is an empty string', () => {
    beforeEach(async () => {
      await signedFetch(`${baseUrl}/env/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: '' }),
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    afterEach(async () => {
      await signedFetch(`${baseUrl}/env/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    it('should respond with a 200 and the empty string instead of a 404', async () => {
      const response = await signedFetch(`${baseUrl}/env/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        value: ''
      })
    })
  })

  describe('and the database throws an error', () => {
    beforeEach(() => {
      stubComponents.envStorage.getValue.mockRejectedValue(new Error('boom'))
    })

    afterEach(() => {
      stubComponents.envStorage.getValue.mockReset()
    })

    it('should respond with a 500 and the error message', async () => {
      const response = await signedFetch(`${baseUrl}/env/${key}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
      const body = await response.json()
      expect(response.status).toBe(500)
      expect(body).toEqual({
        error: 'Internal Server Error'
      })
    })
  })

  describe('and the request is authorized via a scene-scoped storage delegation', () => {
    const SCENE_ID = 'bafkrei-clean-the-club'
    // Metadata a headless worker echoes for a storage request: the delegation's world,
    // parcel (→ placeId) and sceneId. `signer` is anything but 'decentraland-kernel-scene'.
    const scopedMetadata = {
      realm: { serverName: WORLD_NAMES.DEFAULT },
      parcel: '0,0',
      sceneId: SCENE_ID,
      signer: 'dcl:authoritative-server'
    }
    // The authoritative server that signs the scope claim, and the throwaway ephemeral
    // the worker actually signs the request with (never the authoritative key).
    let authoritative: ReturnType<typeof createUnsafeIdentity>
    let ephemeral: ReturnType<typeof createUnsafeIdentity>
    let workerIdentity: AuthIdentity
    let storedValue: string
    let restoreConfig: () => void

    // Root-signed `x-authoritative-scope` claim binding `ephemeral` to a scene.
    function buildScopeHeader(overrides: { world?: string; sceneId?: string; parcel?: string } = {}): string {
      const payload = [
        'Decentraland Authoritative Storage Delegation',
        `Ephemeral: ${ephemeral.address.toLowerCase()}`,
        `World: ${(overrides.world ?? WORLD_NAMES.DEFAULT).toLowerCase()}`,
        `SceneId: ${overrides.sceneId ?? SCENE_ID}`,
        `Parcel: ${overrides.parcel ?? '0,0'}`,
        `Expiration: ${new Date(Date.now() + 3_600_000).toISOString()}`
      ].join('\n')
      const signature = Authenticator.createSignature(authoritative, payload)
      return Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString('base64')
    }

    beforeEach(async () => {
      storedValue = 'secret-api-key-12345'
      // Seed the value as the world owner (setup mocks getPermissions.owner = the identity).
      await signedFetch(`${baseUrl}/env/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: storedValue }),
        identity,
        metadata: TEST_REALM_METADATA
      })

      authoritative = createUnsafeIdentity()
      ephemeral = createUnsafeIdentity()
      workerIdentity = await Authenticator.initializeAuthChain(
        ephemeral.address,
        createUnsafeIdentity(),
        10,
        async message => Authenticator.createSignature(ephemeral, message)
      )

      // The claim must be signed by AUTHORITATIVE_SERVER_ADDRESS; point it at our signer.
      const previousGetString = components.config.getString
      components.config.getString = async (configKey: string) =>
        configKey === 'AUTHORITATIVE_SERVER_ADDRESS' ? authoritative.address : previousGetString(configKey)
      restoreConfig = () => {
        components.config.getString = previousGetString
      }
    })

    afterEach(async () => {
      restoreConfig()
      await signedFetch(`${baseUrl}/env/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
    })

    describe('and the delegation is valid for the scene', () => {
      let response: Awaited<ReturnType<typeof signedFetch>>

      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'GET',
          identity: workerIdentity,
          metadata: scopedMetadata,
          headers: { 'x-authoritative-scope': buildScopeHeader() }
        })
      })

      it('should respond with a 200 and the stored value', async () => {
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({ value: storedValue })
      })
    })

    describe('and the delegation is bound to a different parcel than the request targets', () => {
      let response: Awaited<ReturnType<typeof signedFetch>>

      beforeEach(async () => {
        // The worker targets parcel 0,0 (where the value lives) but its claim is bound
        // to another parcel. The parcel pins the placeId, so it must be rejected —
        // a worker cannot use one scene's claim to read another scene's env values.
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'GET',
          identity: workerIdentity,
          metadata: scopedMetadata,
          headers: { 'x-authoritative-scope': buildScopeHeader({ parcel: PARCELS.SCENE_A }) }
        })
      })

      it('should respond with a 401 and an unauthorized message', async () => {
        const body = await response.json()
        expect(response.status).toBe(401)
        expect(body).toEqual({
          error: 'Not Authorized',
          message: 'Unauthorized: Signer is not authorized to perform operations on this world'
        })
      })
    })
  })
})
