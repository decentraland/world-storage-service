import type { IFetchComponent } from '@dcl/core-commons'
import type { AuthIdentity } from '@dcl/crypto'
import { AUTH_METADATA_HEADER } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { signedFetchFactory as createSignedFetch } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

const KEY = 'my-key'
const SIGNED_METADATA = { ...TEST_REALM_METADATA, signer: 'decentraland-kernel-scene' }
const DELIVERED_METADATA = JSON.stringify({ ...TEST_REALM_METADATA, signer: 'Decentraland-Kernel-Scene' })

/**
 * Delivers a metadata header that differs from the one `signedFetch` actually signed. The canonical
 * payload is lowercased before signing, so a value differing only in case shares the signature —
 * the request arrives genuinely authentic while reading differently to any case-sensitive
 * comparison downstream. This is the attack, not a mock: nothing here weakens the signature.
 */
function createTamperingFetch(localFetch: IFetchComponent, deliveredMetadata: string): typeof fetch {
  return (async (input: Request): Promise<Response> => {
    const url = new URL(input.url)
    const headers = Object.fromEntries(input.headers.entries())
    headers[AUTH_METADATA_HEADER] = deliveredMetadata

    return localFetch.fetch(url.pathname + url.search, {
      method: input.method,
      headers
    }) as unknown as Response
  }) as unknown as typeof fetch
}

test('when a request carries a scene signer', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string
  let identity: AuthIdentity
  let resetStubs: () => void

  beforeEach(async () => {
    const setup = await createTestSetup(components, stubComponents)
    signedFetch = setup.signedFetch
    baseUrl = setup.baseUrl
    identity = setup.identity
    resetStubs = setup.resetStubs
  })

  afterEach(() => {
    resetStubs()
  })

  describe('and the canonical signer was signed but a mixed-case spelling is delivered', () => {
    let response: Awaited<ReturnType<ReturnType<typeof signedFetchFactory>>>

    beforeEach(async () => {
      const tamperingFetch = createSignedFetch({
        fetch: createTamperingFetch(components.localFetch, DELIVERED_METADATA)
      })

      response = await tamperingFetch(`${baseUrl}/values/${KEY}`, {
        method: 'GET',
        identity,
        metadata: SIGNED_METADATA
      })
    })

    it('should reject the request rather than let it past the scene gate', async () => {
      const body = await response.json()

      // Without this guard the mixed-case spelling fails the strict `!== 'decentraland-kernel-scene'`
      // check in routes.ts, so the scene request is read as a directly user-signed one and served.
      expect(response.status).toBe(400)
      // The raw metadata is echoed back truncated at 64 characters, so match the prefix.
      expect(body.error).toMatch(/^Invalid chain metadata: /)
    })
  })

  // Whitespace is signature-bound: `createPayload` lowercases but never trims, so a padded value
  // changes the signed bytes and no third party can add or strip it in flight. These are therefore
  // signed as delivered rather than tampered with. What they pin is the other half of the guard —
  // a padded value used to pass the strict `!==` in routes.ts and be read as user-signed, which is
  // a silent misclassification rather than a signature bypass.
  describe.each([
    ['a leading space', ' decentraland-kernel-scene'],
    ['a trailing space', 'decentraland-kernel-scene '],
    ['a tab', '\tdecentraland-kernel-scene']
  ])('and the scene signer is delivered with %s', (_case, signer) => {
    let response: Awaited<ReturnType<ReturnType<typeof signedFetchFactory>>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/values/${KEY}`, {
        method: 'GET',
        identity,
        metadata: { ...TEST_REALM_METADATA, signer }
      })
    })

    it('should be rejected by the guard rather than reaching the scene gate', async () => {
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toMatch(/^Invalid chain metadata: /)
    })
  })

  describe('and the canonical signer is delivered exactly as signed', () => {
    let response: Awaited<ReturnType<ReturnType<typeof signedFetchFactory>>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/values/${KEY}`, {
        method: 'GET',
        identity,
        metadata: SIGNED_METADATA
      })
    })

    it('should reject it as a scene request', async () => {
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toMatch(/^Invalid metadata content: /)
    })
  })

  describe('and the request carries no signer at all', () => {
    let response: Awaited<ReturnType<ReturnType<typeof signedFetchFactory>>>

    beforeEach(async () => {
      response = await signedFetch(`${baseUrl}/values/${KEY}`, {
        method: 'GET',
        identity,
        metadata: TEST_REALM_METADATA
      })
    })

    it('should authenticate normally and reach the handler', async () => {
      const body = await response.json()

      // Ordinary user traffic must be untouched by the guard: this gets all the way to the
      // handler, which reports the value does not exist.
      expect(response.status).toBe(404)
      expect(body).toEqual({ error: 'Not Found', message: 'Value not found' })
    })
  })
})
