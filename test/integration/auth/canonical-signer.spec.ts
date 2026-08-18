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

    it('should respond with a 401 and an invalid signature error rather than let it past the scene gate', async () => {
      const body = await response.json()

      // The metadata validator in routes.ts runs before signature verification and lets this
      // through: the mixed-case spelling fails its strict `!== 'decentraland-kernel-scene'`
      // check, so the request reads as a directly user-signed one. The signature is what
      // refuses it now — the delivered metadata bytes are not the ones that were signed.
      expect(response.status).toBe(401)
      expect(body.error).toMatch(/^Invalid signature/)
    })
  })

  // Whitespace is signature-bound: the padded value is signed exactly as delivered, so the
  // signature verifies and no third party can add or strip the padding in flight. These are
  // therefore signed as delivered rather than tampered with.
  //
  // BEHAVIOUR CHANGE (@dcl/crypto-middleware 6): 5.1.0 rejected these with 400 `Invalid chain
  // metadata` via a canonical-value guard requiring `signer`/`intent` to equal their own
  // `trim().toLowerCase()`. Version 6 drops that guard, and binding the metadata bytes to the
  // signature says nothing about a value that was already padded when signed. So a padded scene
  // signer now passes the strict `!==` in routes.ts and is served as an ordinary user-signed
  // request.
  //
  // This is not a privilege escalation. Producing a padded value requires holding the identity
  // key, and a key holder can simply omit `signer` altogether — which 5.1.0 permitted too, since
  // its guard only inspected `typeof value === 'string'` and absent values always passed. The
  // guard rejected one spelling of a self-declared label while leaving omission open, so it never
  // established the invariant it appeared to. `signer` is a self-declared role; the authenticated
  // fact is the address recovered from the auth chain.
  //
  // Canonical form is therefore a client-side contract. A service that wants it enforced does so
  // in `metadataValidator`, which runs before signature verification. These cases pin the current
  // behaviour so a future change to it is deliberate rather than accidental.
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

    it('should authenticate and reach the handler, misread as a user-signed request', async () => {
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body).toEqual({ error: 'Not Found', message: 'Value not found' })
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
