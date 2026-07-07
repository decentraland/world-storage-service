import { Authenticator } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { verifyStorageDelegation } from '../../../src/utils/storage-delegation'

const PREFIX = 'Decentraland Authoritative Storage Delegation'

// A random account standing in for the authoritative server, and a throwaway
// ephemeral the worker would sign storage requests with.
const authoritative = createUnsafeIdentity()
const ephemeral = createUnsafeIdentity()
const TRUSTED = [authoritative.address.toLowerCase()]
const WORLD = 'boedo.dcl.eth'

function buildScopeHeader(params: {
  ephemeralAddress?: string
  world?: string
  expiration?: number
  signer?: typeof authoritative
} = {}): string {
  const ephemeralAddress = params.ephemeralAddress ?? ephemeral.address
  const world = params.world ?? WORLD
  const expiration = params.expiration ?? Date.now() + 60_000
  const signer = params.signer ?? authoritative

  const payload = [
    PREFIX,
    `Ephemeral: ${ephemeralAddress.toLowerCase()}`,
    `World: ${world}`,
    `Expiration: ${new Date(expiration).toISOString()}`
  ].join('\n')
  const signature = Authenticator.createSignature(signer, payload)
  return Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString('base64')
}

describe('verifyStorageDelegation', () => {
  describe('when the delegation is valid', () => {
    it('authorizes the request', async () => {
      const header = buildScopeHeader()
      await expect(verifyStorageDelegation(header, ephemeral.address, WORLD, TRUSTED)).resolves.toEqual({ ok: true })
    })

    it('is case-insensitive on the request signer and world', async () => {
      const header = buildScopeHeader()
      const result = await verifyStorageDelegation(header, ephemeral.address.toUpperCase(), WORLD.toUpperCase(), TRUSTED)
      expect(result).toEqual({ ok: true })
    })
  })

  describe('when the claim binds a different ephemeral than the request signer', () => {
    it('rejects (prevents replaying a captured claim with another key)', async () => {
      const header = buildScopeHeader()
      const other = createUnsafeIdentity()
      const result = await verifyStorageDelegation(header, other.address, WORLD, TRUSTED)
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim world differs from the target world', () => {
    it('rejects', async () => {
      const header = buildScopeHeader({ world: 'other.dcl.eth' })
      const result = await verifyStorageDelegation(header, ephemeral.address, WORLD, TRUSTED)
      expect(result.ok).toBe(false)
    })
  })

  describe('when the delegation has expired', () => {
    it('rejects', async () => {
      const header = buildScopeHeader({ expiration: Date.now() - 1_000 })
      const result = await verifyStorageDelegation(header, ephemeral.address, WORLD, TRUSTED)
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim is signed by an untrusted address', () => {
    it('rejects', async () => {
      const attacker = createUnsafeIdentity()
      const header = buildScopeHeader({ signer: attacker })
      const result = await verifyStorageDelegation(header, ephemeral.address, WORLD, TRUSTED)
      expect(result.ok).toBe(false)
    })
  })

  describe('when the header is malformed', () => {
    it('rejects non-base64 / non-JSON input', async () => {
      const result = await verifyStorageDelegation('not-base64-json', ephemeral.address, WORLD, TRUSTED)
      expect(result.ok).toBe(false)
    })

    it('rejects a claim missing the domain-separation prefix', async () => {
      const payload = [`Ephemeral: ${ephemeral.address}`, `World: ${WORLD}`, `Expiration: ${new Date().toISOString()}`].join('\n')
      const signature = Authenticator.createSignature(authoritative, payload)
      const header = Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString('base64')
      const result = await verifyStorageDelegation(header, ephemeral.address, WORLD, TRUSTED)
      expect(result.ok).toBe(false)
    })
  })

  describe('when no trusted signers are configured', () => {
    it('rejects', async () => {
      const header = buildScopeHeader()
      const result = await verifyStorageDelegation(header, ephemeral.address, WORLD, [])
      expect(result.ok).toBe(false)
    })
  })
})
