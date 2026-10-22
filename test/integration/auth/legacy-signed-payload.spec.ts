import { Authenticator } from '@dcl/crypto'
import { test } from '../../components'
import { WORLD_NAMES } from '../../fixtures'
import { createTestSetup } from '../utils/setup'

/**
 * Proves `signedFetchPolicy` is still wired into `wellKnownComponents`.
 *
 * The unit spec drives `verify()` with that policy directly, which pins what the policy does but not
 * that the router uses it. Nothing there fails if the spread is dropped from `routes.ts` — the
 * request would simply start 401ing in production while the suite stayed green. This closes that by
 * going through the real middleware chain.
 *
 * The requests below are signed the way the explorers sign: the whole joined payload folded, with
 * the metadata header delivered verbatim.
 */
const KEY = 'my-key'

/** The metadata bevy sends for a delegated storage request; `serverName` is the key that breaks. */
const EXPLORER_METADATA = {
  origin: 'hammurabi-server//',
  signer: 'dcl:authoritative-server',
  isGuest: false,
  realm: { serverName: WORLD_NAMES.DEFAULT, hostname: 'https://worlds-content-server.decentraland.org' },
  realmName: WORLD_NAMES.DEFAULT,
  parcel: '0,0'
}

/** The body the signed-fetch middleware answers with when it refuses a request itself. */
const ADR44_REFUSAL = 'This endpoint requires a signed fetch request. See ADR-44.'

test('when an explorer signs the pre-6.0.0 folded payload', function ({ components, stubComponents }) {
  let baseUrl: string
  let identity: Awaited<ReturnType<typeof createTestSetup>>['identity']
  let resetStubs: () => void

  beforeEach(async () => {
    const setup = await createTestSetup(components, stubComponents)
    baseUrl = setup.baseUrl
    identity = setup.identity
    resetStubs = setup.resetStubs
  })

  afterEach(() => {
    resetStubs()
  })

  /** Builds headers signing the folded payload, delivering `delivered` (default: as signed). */
  function legacyHeaders(
    method: string,
    path: string,
    metadata: Record<string, unknown>,
    delivered?: Record<string, unknown>
  ): Record<string, string> {
    const timestamp = Date.now()
    const payload = [method, path, String(timestamp), JSON.stringify(metadata)].join(':').toLowerCase()
    const chain = Authenticator.signPayload(
      {
        ephemeralIdentity: identity.ephemeralIdentity,
        // Comfortably in the future rather than `new Date()`, so the chain cannot age out mid-run.
        expiration: new Date(Date.now() + 10 * 60 * 1000),
        authChain: identity.authChain
      },
      payload
    )

    const headers: Record<string, string> = {}
    chain.forEach((link, index) => {
      headers[`x-identity-auth-chain-${index}`] = JSON.stringify(link)
    })
    headers['x-identity-timestamp'] = String(timestamp)
    headers['x-identity-metadata'] = JSON.stringify(delivered ?? metadata)

    return headers
  }

  const path = `/values/${KEY}`

  describe('and the metadata is delivered as signed', () => {
    let response: Awaited<ReturnType<typeof components.localFetch.fetch>>

    beforeEach(async () => {
      response = await components.localFetch.fetch(path, {
        method: 'GET',
        headers: legacyHeaders('GET', path, EXPLORER_METADATA)
      })
    })

    // Reaching a handler at all is the proof: the middleware is not optional here, so a request that
    // fails verification is answered by the middleware and never runs one. What the handler then
    // decides about authorization is a separate question this spec does not assert.
    it('should get past signed-fetch verification rather than be refused by it', async () => {
      await expect(response.json()).resolves.not.toMatchObject({ message: ADR44_REFUSAL })
    })
  })

  describe('and a declared key is delivered under another spelling', () => {
    let response: Awaited<ReturnType<typeof components.localFetch.fetch>>

    beforeEach(async () => {
      // `realmName` resolves the world, which scopes the storage. Folded, this spelling signs
      // identically to the canonical one, so only the declared-key guard can refuse it.
      const delivered = Object.fromEntries(
        Object.entries(EXPLORER_METADATA).map(([key, value]) => [key === 'realmName' ? 'RealmName' : key, value])
      )
      response = await components.localFetch.fetch(path, {
        method: 'GET',
        headers: legacyHeaders('GET', path, EXPLORER_METADATA, delivered)
      })
    })

    it('should be refused by the middleware rather than authorized on an unpinned field', async () => {
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ message: ADR44_REFUSAL })
    })
  })

  describe('and the request carries the scene signer', () => {
    let response: Awaited<ReturnType<typeof components.localFetch.fetch>>

    beforeEach(async () => {
      const metadata = { ...EXPLORER_METADATA, signer: 'decentraland-kernel-scene' }
      response = await components.localFetch.fetch(path, {
        method: 'GET',
        headers: legacyHeaders('GET', path, metadata)
      })
    })

    // Accepting the older payload format widened which signatures verify, not who may call.
    it('should still be refused, so the fallback has not widened access', async () => {
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ message: ADR44_REFUSAL })
    })
  })
})
