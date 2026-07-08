import type { AuthChain } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'

// Domain-separated prefix for the world-scoped storage delegation claim. Must
// match the minter in sdk-multiplayer-server's comms-gatekeeper. Kept distinct
// from "Decentraland Login" so a login signature can never be replayed as a
// storage delegation (or vice versa).
const STORAGE_DELEGATION_PREFIX = 'Decentraland Authoritative Storage Delegation'

// Upper bound on the x-authoritative-scope header before we base64-decode and
// JSON.parse it. A legitimate claim is a few hundred bytes; this caps work on
// attacker-supplied input.
const MAX_SCOPE_HEADER_LENGTH = 4096

// `reason` is optional (populated only on rejection) so callers can read it
// without relying on discriminated-union narrowing across an early return.
export interface StorageDelegationResult {
  ok: boolean
  reason?: string
}

interface ParsedClaim {
  ephemeral: string
  world: string
  sceneId: string
  parcel: string
  expiration: number
}

/** The scene the request targets, matched against the (root-signed) claim. */
export interface StorageDelegationTarget {
  /** The request's recovered signer address, lowercased (the ephemeral). */
  signer: string
  /** The target world, lowercased. */
  world: string
  /** The target scene entity hash. */
  sceneId: string
  /** The target base parcel (`"x,y"`) — pins the storage placeId. */
  parcel: string
  /** Lowercased authoritative addresses allowed to sign a delegation. */
  trustedSigners: string[]
}

/**
 * Parse the canonical, root-signed claim payload:
 *
 *   Decentraland Authoritative Storage Delegation
 *   Ephemeral: 0x<addr>
 *   World: <name>
 *   SceneId: <hash>
 *   Parcel: <x,y>
 *   Expiration: <ISO8601>
 *
 * Fields after the prefix line are matched by prefix (order-agnostic). Returns
 * null on any structural deviation.
 */
const CLAIM_FIELDS = ['Ephemeral:', 'World:', 'SceneId:', 'Parcel:', 'Expiration:'] as const

function parseClaim(payload: string): ParsedClaim | null {
  const lines = payload.split('\n')
  if (lines[0] !== STORAGE_DELEGATION_PREFIX) return null

  // Require EXACTLY the known field lines, each present once — no unknown, extra,
  // or duplicate lines. The payload is signature-checked afterwards so an attacker
  // can't craft this, but strictness makes any minter/verifier format drift fail
  // closed instead of silently binding an unexpected value. (No field prefix is a
  // prefix of another, so the match is unambiguous.)
  const values = new Map<string, string>()
  for (const line of lines.slice(1)) {
    const prefix = CLAIM_FIELDS.find(p => line.startsWith(p))
    if (!prefix || values.has(prefix)) return null
    values.set(prefix, line.slice(prefix.length).trim())
  }
  if (values.size !== CLAIM_FIELDS.length) return null

  const ephemeral = values.get('Ephemeral:')?.toLowerCase()
  const world = values.get('World:')?.toLowerCase()
  const sceneId = values.get('SceneId:')
  const parcel = values.get('Parcel:')
  const expirationIso = values.get('Expiration:')
  if (!ephemeral || !world || !sceneId || !parcel || !expirationIso) return null

  const expiration = Date.parse(expirationIso)
  if (!Number.isFinite(expiration)) return null

  return { ephemeral, world, sceneId, parcel, expiration }
}

/**
 * Verify a world-scoped authoritative storage delegation carried in the
 * `x-authoritative-scope` header (base64 JSON `{ payload, signature }`).
 *
 * A request is authorized when ALL hold:
 *  - the claim is well-formed and unexpired,
 *  - its ephemeral == the request's actual signer (so a captured claim can't be
 *    replayed with a different signing key),
 *  - its world == the target world, its sceneId == the target scene, and its
 *    parcel == the target parcel (so a compromised worker is confined to its own
 *    scene's storage `placeId`, not the whole world),
 *  - `signature` over `payload` was produced by one of the trusted authoritative
 *    addresses (an EOA personal signature — contract-wallet signers are not supported).
 *
 * Confinement model: the load-bearing binding is `parcel`, because the storage
 * bucket is `placeId = f(world, parcel)` and the same request-supplied `parcel` is
 * both resolved to the placeId AND checked against the claim — so a worker can only
 * reach the place its claim names. `sceneId` is checked too but is defense-in-depth
 * (nothing keys storage by it). If the Places API ever resolves several parcels of
 * one scene to a single `placeId`, per-scene confinement degrades to per-place —
 * still the intended floor, just coarser.
 *
 * @param scopeHeader raw `x-authoritative-scope` header value (base64)
 * @param target      the request's signer + resolved world/scene/parcel + trusted signers
 */
export async function verifyStorageDelegation(
  scopeHeader: string,
  target: StorageDelegationTarget
): Promise<StorageDelegationResult> {
  const { signer, world, sceneId, parcel, trustedSigners } = target

  if (trustedSigners.length === 0) {
    return { ok: false, reason: 'no trusted authoritative signers configured' }
  }
  if (scopeHeader.length > MAX_SCOPE_HEADER_LENGTH) {
    return { ok: false, reason: 'scope header too large' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(scopeHeader, 'base64').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed scope header' }
  }

  // JSON.parse('null') returns null (and primitives/arrays are also valid JSON),
  // so guard the shape before destructuring — otherwise `null` throws a TypeError
  // out of this function → 500, and also breaks the owner/deployer fall-through.
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'malformed scope header' }
  }

  const { payload, signature } = parsed as { payload?: unknown; signature?: unknown }
  if (typeof payload !== 'string' || typeof signature !== 'string') {
    return { ok: false, reason: 'scope missing payload or signature' }
  }

  const claim = parseClaim(payload)
  if (!claim) return { ok: false, reason: 'unparseable claim' }

  if (claim.ephemeral !== signer.toLowerCase()) {
    return { ok: false, reason: 'claim ephemeral does not match request signer' }
  }
  if (claim.world !== world.toLowerCase()) {
    return { ok: false, reason: 'claim world does not match target world' }
  }
  if (claim.sceneId !== sceneId) {
    return { ok: false, reason: 'claim sceneId does not match target scene' }
  }
  if (claim.parcel !== parcel) {
    return { ok: false, reason: 'claim parcel does not match target parcel' }
  }
  if (!(claim.expiration > Date.now())) {
    return { ok: false, reason: 'delegation expired' }
  }

  // The claim must be personally signed by a trusted authoritative address.
  for (const root of trustedSigners) {
    if (await isPersonalSignatureBy(root, payload, signature)) return { ok: true }
  }

  return { ok: false, reason: 'claim not signed by a trusted authoritative address' }
}

/**
 * Whether `message` carries a valid EOA personal signature by `address`.
 *
 * Implemented by expressing it as a minimal `[SIGNER, ECDSA_PERSONAL_SIGNED_ENTITY]`
 * auth-chain and delegating to the vetted `Authenticator.validateSignature`, rather
 * than a hand-rolled ecrecover. Contained here behind a clear name so callers don't
 * need to understand the auth-chain shape. Contract-wallet (EIP-1654) signers are
 * intentionally unsupported (`provider = null`).
 */
async function isPersonalSignatureBy(address: string, message: string, signature: string): Promise<boolean> {
  const chain: AuthChain = [
    { type: AuthLinkType.SIGNER, payload: address, signature: '' },
    { type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, payload: message, signature }
  ]
  try {
    const result = await Authenticator.validateSignature(message, chain, null)
    return result.ok
  } catch {
    return false
  }
}
