import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import verify from '@dcl/crypto-middleware/dist/verify'
import { Authenticator } from '@dcl/crypto'
import type { VerifyAuthChainHeadersOptions } from '@dcl/crypto-middleware'
import { signedFetchPolicy } from '../../../src/controllers/signed-fetch-policy'

/**
 * Pins that the scene gate cannot be walked past by re-spelling the key it reads.
 *
 * `rejectIfSigner` reads the own property `signer`. A request delivering `{"Signer":...}` therefore
 * presented no `signer` at all, and the gate answered "allowed" for metadata that visibly names the
 * signer it exists to refuse. `canonicalMetadataKeys` already refused that on the legacy path, via
 * `assertLegacyMetadataKeys` -- but the legacy path is only consulted after the current-format check
 * fails, and re-spelling a key is something the client can simply sign. Signed that way, the strict
 * check verifies, the fallback is never reached, and nothing looked at the spelling.
 *
 * @dcl/crypto-middleware 6.3.0 closes that: a key case-folding to `signer` without being spelled
 * exactly that is a rejection rather than an absence. Nothing is folded -- the request is refused,
 * not rewritten.
 *
 * Driven through `verify()` with the options `routes.ts` wires, rather than through the router,
 * because the question is what the gate decides, not what a handler answers afterwards.
 */
const METHOD = 'GET'
const PATH = '/values'

/** The signer an explorer stamps on an auth chain signed on a scene's behalf. */
const SCENE_SIGNER = 'decentraland-kernel-scene'

/** Ordinary delegated-storage metadata, minus the signer each case below supplies. */
const EXPLORER_METADATA = {
  origin: 'hammurabi-server//',
  isGuest: false,
  realm: { serverName: 'boedo.dcl.eth', hostname: 'https://worlds-content-server.decentraland.org' },
  realmName: 'boedo.dcl.eth',
  sceneId: 'bafkreitest',
  parcel: '0,0'
}

/** The policy the router wires, imported rather than restated so this cannot pass against a copy. */
const VERIFY_OPTIONS: VerifyAuthChainHeadersOptions = signedFetchPolicy

describe('when a client signs the current 6.x payload', () => {
  let fetcher: NonNullable<VerifyAuthChainHeadersOptions['fetcher']>

  beforeEach(() => {
    // Personal-signature chains never resolve a contract wallet, so a call here would mean the test
    // stopped exercising what it claims to.
    fetcher = { fetch: jest.fn().mockRejectedValue(new Error('no network in unit tests')) }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  /**
   * Signs `metadata` with the 6.x payload -- method, path and timestamp folded, metadata joined
   * verbatim -- and delivers exactly those bytes.
   *
   * Signing rather than tampering is the whole point: the metadata is covered by the signature
   * since 6.0.0, so a key rewritten in flight would fail verification and prove nothing about the
   * gate. A client that wants a differently-spelled key simply signs it that way, and the result
   * is a request whose signature is entirely valid.
   */
  async function run(metadata: Record<string, unknown>) {
    const ephemeralIdentity = createUnsafeIdentity()
    const realAccount = createUnsafeIdentity()
    const authChain = await Authenticator.initializeAuthChain(
      realAccount.address,
      ephemeralIdentity,
      10,
      async message => Authenticator.createSignature(realAccount, message)
    )

    const timestamp = Date.now()
    const raw = JSON.stringify(metadata)
    const payload = [METHOD.toLowerCase(), PATH.toLowerCase(), String(timestamp), raw].join(':')
    const chain = Authenticator.signPayload(
      { ephemeralIdentity, expiration: new Date(), authChain: authChain.authChain },
      payload
    )

    const headers: Record<string, string> = {}
    chain.forEach((link, index) => {
      headers[`x-identity-auth-chain-${index}`] = JSON.stringify(link)
    })
    headers['x-identity-timestamp'] = String(timestamp)
    headers['x-identity-metadata'] = raw

    return verify(METHOD, PATH, headers, { fetcher, ...VERIFY_OPTIONS })
  }

  describe('and the metadata carries no signer at all', () => {
    let metadata: Record<string, unknown>

    beforeEach(() => {
      metadata = { ...EXPLORER_METADATA }
    })

    it('should verify, so ordinary delegated storage traffic is untouched by the gate', async () => {
      await expect(run(metadata)).resolves.toMatchObject({ auth: expect.any(String) })
    })
  })

  describe('and the metadata names the scene signer under the declared spelling', () => {
    let metadata: Record<string, unknown>

    beforeEach(() => {
      metadata = { ...EXPLORER_METADATA, signer: SCENE_SIGNER }
    })

    it('should be refused by the scene gate before any signature verification runs', async () => {
      await expect(run(metadata)).rejects.toThrow('Invalid metadata content')
    })
  })

  // The bypass, one spelling per case. Each of these is a validly signed request: the client chose
  // the key before signing, so the bytes it delivers are the bytes it signed and the strict check
  // has no objection to make. Only the gate can refuse them, and before 6.3.0 it did not -- it read
  // the field as absent and answered "allowed" for a request that names the scene signer outright.
  describe.each([['Signer'], ['SIGNER'], ['sIgNeR']])(
    'and the metadata names the scene signer under the key %p',
    key => {
      let metadata: Record<string, unknown>

      beforeEach(() => {
        metadata = { ...EXPLORER_METADATA, [key]: SCENE_SIGNER }
      })

      it('should be refused rather than read as having no signer', async () => {
        await expect(run(metadata)).rejects.toThrow('Invalid metadata content')
      })
    }
  )
})
