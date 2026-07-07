import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { Authenticator } from '@dcl/crypto'
import { verifyStorageDelegation } from '../../../src/utils/storage-delegation'

const PREFIX = 'Decentraland Authoritative Storage Delegation'

// A random account standing in for the authoritative server, and a throwaway
// ephemeral the worker would sign storage requests with.
const authoritative = createUnsafeIdentity()
const ephemeral = createUnsafeIdentity()
const TRUSTED = [authoritative.address.toLowerCase()]
const WORLD = 'boedo.dcl.eth'
const SCENE = 'bafkrei-scene'
const PARCEL = '5,7'

function buildScopeHeader(
  params: {
    ephemeralAddress?: string
    world?: string
    sceneId?: string
    parcel?: string
    expiration?: number
    signer?: typeof authoritative
  } = {}
): string {
  const ephemeralAddress = params.ephemeralAddress ?? ephemeral.address
  const world = params.world ?? WORLD
  const sceneId = params.sceneId ?? SCENE
  const parcel = params.parcel ?? PARCEL
  const expiration = params.expiration ?? Date.now() + 3_600_000
  const signer = params.signer ?? authoritative

  const payload = [
    PREFIX,
    `Ephemeral: ${ephemeralAddress.toLowerCase()}`,
    `World: ${world}`,
    `SceneId: ${sceneId}`,
    `Parcel: ${parcel}`,
    `Expiration: ${new Date(expiration).toISOString()}`
  ].join('\n')
  const signature = Authenticator.createSignature(signer, payload)
  return Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString('base64')
}

// Verify against the "correct" target by default; override individual fields to
// simulate a request that doesn't match the claim.
function verify(
  header: string,
  target: Partial<{ signer: string; world: string; sceneId: string; parcel: string; trustedSigners: string[] }> = {}
) {
  return verifyStorageDelegation(header, {
    signer: ephemeral.address,
    world: WORLD,
    sceneId: SCENE,
    parcel: PARCEL,
    trustedSigners: TRUSTED,
    ...target
  })
}

describe('verifyStorageDelegation', () => {
  describe('when the delegation is valid', () => {
    it('authorizes the request', async () => {
      await expect(verify(buildScopeHeader())).resolves.toEqual({ ok: true })
    })

    it('is case-insensitive on the request signer and world', async () => {
      const result = await verify(buildScopeHeader(), {
        signer: ephemeral.address.toUpperCase(),
        world: WORLD.toUpperCase()
      })
      expect(result).toEqual({ ok: true })
    })
  })

  describe('when the claim binds a different ephemeral than the request signer', () => {
    it('rejects (prevents replaying a captured claim with another key)', async () => {
      const other = createUnsafeIdentity()
      const result = await verify(buildScopeHeader(), { signer: other.address })
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim world differs from the target world', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ world: 'other.dcl.eth' }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim scene differs from the target scene', () => {
    it('rejects (confines a worker to its own scene, not the whole world)', async () => {
      const result = await verify(buildScopeHeader({ sceneId: 'bafkrei-other-scene' }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim parcel differs from the target parcel', () => {
    it('rejects (the parcel pins the storage placeId)', async () => {
      const result = await verify(buildScopeHeader({ parcel: '99,99' }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the delegation has expired', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ expiration: Date.now() - 1_000 }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim is signed by an untrusted address', () => {
    it('rejects', async () => {
      const attacker = createUnsafeIdentity()
      const result = await verify(buildScopeHeader({ signer: attacker }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the header is malformed', () => {
    it('rejects non-base64 / non-JSON input', async () => {
      const result = await verify('not-base64-json')
      expect(result.ok).toBe(false)
    })

    it('rejects an oversized header before decoding', async () => {
      const result = await verify('A'.repeat(5000))
      expect(result).toEqual({ ok: false, reason: 'scope header too large' })
    })

    it('rejects a claim missing the domain-separation prefix', async () => {
      const payload = [
        `Ephemeral: ${ephemeral.address}`,
        `World: ${WORLD}`,
        `SceneId: ${SCENE}`,
        `Parcel: ${PARCEL}`
      ].join('\n')
      const signature = Authenticator.createSignature(authoritative, payload)
      const header = Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString('base64')
      const result = await verify(header)
      expect(result.ok).toBe(false)
    })
  })

  describe('when no trusted signers are configured', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader(), { trustedSigners: [] })
      expect(result.ok).toBe(false)
    })
  })
})
