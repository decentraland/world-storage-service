/** Suffix identifying name-bearer world realms: Decentraland NAMEs (`foo.dcl.eth`) and,
 * when the content server runs with `ALLOW_ENS_DOMAINS`, ENS domains (`foo.eth`). */
const WORLD_NAME_SUFFIX = '.eth'

/**
 * Returns whether a realm name identifies a world (`*.eth`, which subsumes `*.dcl.eth`).
 *
 * This mirrors the routing in worlds-content-server's name ownership, where every `.eth`
 * name resolves to an on-chain owner. Matching only `.dcl.eth` would send ENS worlds down
 * the Genesis City path, keying their storage by LAND ownership at their base parcel.
 *
 * The check is case-insensitive: realm names reach the service from client-supplied
 * signed metadata, which may carry any casing.
 *
 * @param worldName - The realm name to check
 */
export function isWorldName(worldName: string): boolean {
  return worldName.toLowerCase().endsWith(WORLD_NAME_SUFFIX)
}

/**
 * Returns whether a realm name identifies a shared realm (Genesis City catalysts such as
 * `main` or `artemis`) rather than a world.
 *
 * Shared realms host scenes owned by unrelated land owners under a single realm name, so
 * anything scoped "per world" (storage quotas, usage aggregation, advisory locks) must be
 * scoped per place instead — otherwise unrelated scenes would compete for, and disclose,
 * a single realm-wide pool.
 *
 * @param worldName - The realm name to check
 */
export function isSharedRealmName(worldName: string): boolean {
  return !isWorldName(worldName)
}
