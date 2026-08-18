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
 * Delivers a metadata header that differs from the one `signedFetch` actually signed. As of
 * @dcl/crypto-middleware 6 the metadata is joined into the signed payload verbatim, so rewriting
 * any of its bytes — casing included — no longer shares the original signature. This is still a
 * genuine in-flight tamper rather than a mock: nothing here weakens the signature, the rewrite is
 * simply now caught by signature verification instead of by a metadata guard.
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

    it('should reject it rather than let it past the scene gate', async () => {
      const body = await response.json()

      // Two layers refuse this and the earlier one wins. `rejectIfSigner` refuses a non-canonical
      // signer, and `metadataValidator` runs before signature verification, so the gate answers
      // first with a 400. The signature would refuse it a step later anyway — the delivered bytes
      // are not the ones that were signed — but it never gets that far, which is the cheaper
      // outcome since no crypto runs.
      expect(response.status).toBe(400)
      expect(body.error).toMatch(/^Invalid metadata content: /)
    })
  })

  // Whitespace is signature-bound: the padded value is signed exactly as delivered, so the
  // signature verifies and no third party can add or strip the padding in flight. These are
  // therefore signed as delivered rather than tampered with, and the signature cannot refuse them.
  //
  // `rejectIfSigner` does. It refuses a `signer` that is not already canonical instead of
  // comparing it, so a padded value never reaches the comparison it would otherwise slip past by
  // reading as "not the scene signer". Nothing is folded — the value is rejected, not rewritten.
  //
  // Between 5.1.0 and this, the library briefly had no view on it: 6.0.0 dropped the canonical
  // guard, and binding metadata bytes to the signature says nothing about a value that was already
  // non-canonical when signed. That gap was never an escalation — producing such a value needs the
  // identity key, and a key holder can simply omit `signer`, which every version has allowed — but
  // it is closed here, at the service, which is where the canonical contract belongs.
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

    it('should reject it rather than let it read as a user-signed request', async () => {
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body.error).toMatch(/^Invalid metadata content: /)
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
