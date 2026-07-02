/** Suffix identifying Decentraland Worlds (NAME bearer realms), e.g. `foo.dcl.eth`. */
const DCL_WORLD_SUFFIX = '.dcl.eth'

/**
 * Returns whether a realm name identifies a Decentraland World (`*.dcl.eth`).
 *
 * The check is case-insensitive: realm names reach the service from client-supplied
 * signed metadata, which may carry any casing.
 *
 * @param worldName - The realm name to check
 */
export function isDclWorldName(worldName: string): boolean {
  return worldName.toLowerCase().endsWith(DCL_WORLD_SUFFIX)
}

/**
 * Returns whether a realm name identifies a shared realm (Genesis City catalysts such as
 * `main` or `artemis`) rather than a Decentraland World.
 *
 * Shared realms host scenes owned by unrelated land owners under a single realm name, so
 * anything scoped "per world" (storage quotas, usage aggregation, advisory locks) must be
 * scoped per place instead — otherwise unrelated scenes would compete for, and disclose,
 * a single realm-wide pool.
 *
 * @param worldName - The realm name to check
 */
export function isSharedRealmName(worldName: string): boolean {
  return !isDclWorldName(worldName)
}
