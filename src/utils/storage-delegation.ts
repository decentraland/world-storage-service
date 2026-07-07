import { Authenticator, AuthLinkType } from '@dcl/crypto'

// Domain-separated prefix for the world-scoped storage delegation claim. Must
// match the minter in sdk-multiplayer-server's comms-gatekeeper. Kept distinct
// from "Decentraland Login" so a login signature can never be replayed as a
// storage delegation (or vice versa).
const STORAGE_DELEGATION_PREFIX = 'Decentraland Authoritative Storage Delegation'

// `reason` is optional (populated only on rejection) so callers can read it
// without relying on discriminated-union narrowing across an early return.
export type StorageDelegationResult = { ok: boolean; reason?: string }

type ParsedClaim = { ephemeral: string; world: string }

/**
 * Parse the canonical, root-signed claim payload:
 *
 *   Decentraland Authoritative Storage Delegation
 *   Ephemeral: 0x<addr>
 *   World: <name>
 *
 * There is no expiry: the ephemeral lives for the life of the scene worker, and
 * a worker compromise is bounded by the world scope (revoke by rotating the key).
 * Returns null on any structural deviation.
 */
function parseClaim(payload: string): ParsedClaim | null {
  const lines = payload.split('\n')
  if (lines[0] !== STORAGE_DELEGATION_PREFIX) return null

  const valueFor = (prefix: string): string | undefined => {
    const line = lines.find(l => l.startsWith(prefix))
    return line ? line.slice(prefix.length).trim() : undefined
  }

  const ephemeral = valueFor('Ephemeral:')?.toLowerCase()
  const world = valueFor('World:')?.toLowerCase()
  if (!ephemeral || !world) return null

  return { ephemeral, world }
}

/**
 * Verify a world-scoped authoritative storage delegation carried in the
 * `x-authoritative-scope` header (base64 JSON `{ payload, signature }`).
 *
 * A request is authorized when ALL hold:
 *  - the claim is well-formed,
 *  - its ephemeral == the request's actual signer (so a captured claim can't be
 *    replayed with a different signing key),
 *  - its world == the target world,
 *  - `signature` over `payload` was produced by one of the trusted authoritative
 *    addresses (an EOA personal signature).
 *
 * There is no expiry check: the delegation lives for the life of the scene worker.
 *
 * @param scopeHeader   raw `x-authoritative-scope` header value (base64)
 * @param requestSigner the request's recovered signer address, lowercased (the ephemeral)
 * @param worldName     the target world, lowercased
 * @param trustedSigners lowercased authoritative addresses allowed to delegate
 */
export async function verifyStorageDelegation(
  scopeHeader: string,
  requestSigner: string,
  worldName: string,
  trustedSigners: string[]
): Promise<StorageDelegationResult> {
  if (trustedSigners.length === 0) {
    return { ok: false, reason: 'no trusted authoritative signers configured' }
  }

  let parsed: { payload?: unknown; signature?: unknown }
  try {
    parsed = JSON.parse(Buffer.from(scopeHeader, 'base64').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed scope header' }
  }

  const { payload, signature } = parsed
  if (typeof payload !== 'string' || typeof signature !== 'string') {
    return { ok: false, reason: 'scope missing payload or signature' }
  }

  const claim = parseClaim(payload)
  if (!claim) return { ok: false, reason: 'unparseable claim' }

  if (claim.ephemeral !== requestSigner.toLowerCase()) {
    return { ok: false, reason: 'claim ephemeral does not match request signer' }
  }
  if (claim.world !== worldName.toLowerCase()) {
    return { ok: false, reason: 'claim world does not match target world' }
  }

  // The claim must be personally signed by a trusted authoritative address. Reuse
  // Authenticator.validateSignature with each candidate as the SIGNER so we lean
  // on vetted signature-verification code rather than hand-rolled ecrecover.
  for (const root of trustedSigners) {
    const chain = [
      { type: AuthLinkType.SIGNER, payload: root, signature: '' },
      { type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, payload, signature }
    ]
    try {
      const result = await Authenticator.validateSignature(payload, chain as any, null as any)
      if (result.ok) return { ok: true }
    } catch {
      // Try the next trusted signer.
    }
  }

  return { ok: false, reason: 'claim not signed by a trusted authoritative address' }
}
