import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import verify from '@dcl/crypto-middleware/dist/verify'
import { Authenticator } from '@dcl/crypto'
import type { VerifyAuthChainHeadersOptions } from '@dcl/crypto-middleware'
import { signedFetchPolicy } from '../../../src/controllers/signed-fetch-policy'

/**
 * Pins that the explorers can still reach this service.
 *
 * They sign the pre-6.0.0 payload -- `format!("{method}:{path}:{ts}:{meta}").to_lowercase()` in
 * bevy's `crates/wallet/src/lib.rs` -- while delivering the metadata header verbatim. Since 6.0.0
 * the metadata is joined into the signed payload as-is, so those two disagree for any metadata
 * carrying uppercase, and verification fails before `authorizationMiddleware` ever runs. A valid
 * storage delegation is never consulted; the caller just sees a 401.
 *
 * Driven through `verify()` with the options `routes.ts` wires, rather than through the router,
 * because the question is which payload formats verify, not what a handler answers afterwards.
 */
const METHOD = 'GET'
const PATH = '/values'

/** Exactly what bevy builds in `crates/wallet/src/delegation.rs` for a delegated storage request. */
const EXPLORER_METADATA = {
  origin: 'hammurabi-server//',
  signer: 'dcl:authoritative-server',
  isGuest: false,
  realm: { serverName: 'boedo.dcl.eth', hostname: 'https://worlds-content-server.decentraland.org' },
  realmName: 'boedo.dcl.eth',
  sceneId: 'bafkreitest',
  parcel: '0,0'
}

/** The policy the router wires, imported rather than restated so this cannot pass against a copy. */
/**
 * A comfortably future expiration for the ephemeral chain.
 *
 * `new Date()` is *now*, which these cases only survive because the current verifier does not check
 * ephemeral expiry on this path. That makes them quietly dependent on it staying that way -- the day
 * it tightens, every case here fails for a reason that has nothing to do with payload formats.
 */
const EPHEMERAL_EXPIRATION = () => new Date(Date.now() + 10 * 60 * 1000)

const VERIFY_OPTIONS: VerifyAuthChainHeadersOptions = signedFetchPolicy

describe('when an explorer signs the pre-6.0.0 folded payload', () => {
  let fetcher: NonNullable<VerifyAuthChainHeadersOptions['fetcher']>

  beforeEach(() => {
    // Personal-signature chains never resolve a contract wallet, so a call here would mean the test
    // stopped exercising what it claims to.
    fetcher = { fetch: jest.fn().mockRejectedValue(new Error('no network in unit tests')) }
  })

  /**
   * Rewrites one key's spelling while keeping every key in place.
   *
   * Order matters: the folded payload covers the serialized metadata, so moving a key changes the
   * signed bytes and the request fails on the signature instead of on the spelling under test.
   */
  function respell(metadata: Record<string, unknown>, from: string, to: string): Record<string, unknown> {
    return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key === from ? to : key, value]))
  }

  /** Signs `metadata` folded, then delivers `delivered` (defaulting to the same) verbatim. */
  async function run(metadata: Record<string, unknown>, delivered?: Record<string, unknown>) {
    const ephemeralIdentity = createUnsafeIdentity()
    const realAccount = createUnsafeIdentity()
    const authChain = await Authenticator.initializeAuthChain(
      realAccount.address,
      ephemeralIdentity,
      10,
      async message => Authenticator.createSignature(realAccount, message)
    )

    const timestamp = Date.now()
    const signedRaw = JSON.stringify(metadata)
    const payload = [METHOD, PATH, String(timestamp), signedRaw].join(':').toLowerCase()
    const chain = Authenticator.signPayload(
      { ephemeralIdentity, expiration: EPHEMERAL_EXPIRATION(), authChain: authChain.authChain },
      payload
    )

    const headers: Record<string, string> = {}
    chain.forEach((link, index) => {
      headers[`x-identity-auth-chain-${index}`] = JSON.stringify(link)
    })
    headers['x-identity-timestamp'] = String(timestamp)
    headers['x-identity-metadata'] = JSON.stringify(delivered ?? metadata)

    return verify(METHOD, PATH, headers, { fetcher, ...VERIFY_OPTIONS })
  }

  describe('and the metadata is delivered as signed', () => {
    it('should verify, so a delegated storage request is not refused before it is authorized', async () => {
      await expect(run(EXPLORER_METADATA)).resolves.toMatchObject({ auth: expect.any(String) })
    })

    it('should hand the service every field it authorizes on, with its original casing', async () => {
      // Nothing is folded on the way in: accepting the older signature does not rewrite what
      // scene-context-middleware and authorization-middleware go on to read.
      const result = await run(EXPLORER_METADATA)

      expect(result.authMetadata).toMatchObject({
        realmName: 'boedo.dcl.eth',
        realm: { serverName: 'boedo.dcl.eth' },
        parcel: '0,0',
        sceneId: 'bafkreitest'
      })
    })
  })

  /**
   * The third column names the guard that answers, and `signer` differs from the rest on purpose.
   *
   * Since @dcl/crypto-middleware 6.3.0 `rejectIfSigner` treats a key case-folding to `signer` as a
   * rejection rather than an absence, and `metadataValidator` runs ahead of signature verification.
   * So a re-spelled `signer` is refused by the scene gate first -- on both payload formats, which
   * is the point of that upgrade -- and `assertLegacyMetadataKeys` never gets to it. The other
   * three are read by this service but not by the gate, so the declared-key guard is still what
   * refuses them, and still only on this path.
   *
   * Both are 400s and both refuse the request; which layer answers is the whole difference.
   */
  describe.each([
    ['signer', 'Signer', 'Invalid metadata content'],
    ['realmName', 'RealmName', 'Invalid chain metadata'],
    ['parcel', 'Parcel', 'Invalid chain metadata'],
    ['sceneId', 'SceneId', 'Invalid chain metadata']
  ])('and the delivered metadata spells %s as %s', (declared, respelled, expectedError) => {
    it('should be refused rather than authorized on a field the signature never pinned', async () => {
      await expect(run(EXPLORER_METADATA, respell(EXPLORER_METADATA, declared, respelled))).rejects.toThrow(
        expectedError
      )
    })
  })

  describe('and the nested realm.serverName is re-spelled', () => {
    it('should be refused, since the world it resolves scopes the storage', async () => {
      const delivered = { ...EXPLORER_METADATA, realm: { ServerName: 'boedo.dcl.eth' } }

      await expect(run(EXPLORER_METADATA, delivered)).rejects.toThrow('Invalid chain metadata')
    })
  })

  describe('and an undeclared key is delivered re-cased', () => {
    it('should verify, since no authorization decision reads it', async () => {
      // States the boundary rather than leaving it implied: `isGuest` is sent by the explorers but
      // never read here, so its spelling cannot change an authorization outcome.
      await expect(run(EXPLORER_METADATA, respell(EXPLORER_METADATA, 'isGuest', 'ISGUEST'))).resolves.toMatchObject({
        auth: expect.any(String)
      })
    })
  })

  describe('and the scene signer is used instead', () => {
    it('should still be refused, so the fallback has not widened who may call', async () => {
      const metadata = { ...EXPLORER_METADATA, signer: 'decentraland-kernel-scene' }

      await expect(run(metadata)).rejects.toThrow('Invalid metadata content')
    })
  })
})
