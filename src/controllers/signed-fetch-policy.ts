import { rejectIfSigner } from '@dcl/crypto-middleware'
import type { VerifyAuthChainHeadersOptions } from '@dcl/crypto-middleware'

/**
 * Metadata keys this service authorizes on, declared so a request signed with the pre-6.0.0 payload
 * still verifies.
 *
 * Every caller is an explorer, and they still fold the whole joined string before signing while
 * delivering the metadata verbatim. The metadata they send is camelCase -- `realmName`, `sceneId`,
 * `isGuest`, `realm.serverName` -- so the folded bytes and the delivered bytes differ and 6.x, which
 * joins the delivered metadata as-is, fails the signature. Every such request is a 401, before
 * the authorization middleware runs, so a perfectly good storage delegation is never even consulted.
 *
 * Declaring the keys is what keeps that scoped rather than a blanket downgrade: the fold leaves key
 * casing outside the signature, so a legacy request could otherwise deliver any of these under a
 * spelling this service reads as absent. Each one below decides an authorization outcome:
 *
 *   signer            the scene gate above
 *   realmName         the world, via scene-context-middleware
 *   realm.serverName  the same, and preferred over realmName when both are present
 *   parcel            resolves the placeId, which scopes the storage and its quota
 *   sceneId           matched against the storage delegation claim in authorization-middleware
 *
 * Property *values* are not covered by this and cannot be -- the fold hides them too. That is why
 * the signer check above must stay `rejectIfSigner` rather than a bare equality comparison.
 *
 * Remove once the explorer clients sign the 6.x payload.
 */
export const CANONICAL_METADATA_KEYS = ['signer', 'realmName', 'realm.serverName', 'parcel', 'sceneId']

/**
 * The verification half of the signed-fetch middleware, kept apart from the route wiring so tests
 * assert the policy this service actually runs rather than a copy of it that can silently drift.
 *
 * `rejectIfSigner` refuses scene-signed requests, and refuses a `signer` that is not already
 * canonical rather than comparing it -- a padded or re-cased value would otherwise read as "not a
 * scene". It must stay a predicate: `canonicalMetadataKeys` binds key spellings but cannot bind
 * values, because the legacy fold hides those from the signature too.
 */
export const signedFetchPolicy: Pick<VerifyAuthChainHeadersOptions, 'metadataValidator' | 'canonicalMetadataKeys'> = {
  metadataValidator: rejectIfSigner('decentraland-kernel-scene'),
  canonicalMetadataKeys: CANONICAL_METADATA_KEYS
}
