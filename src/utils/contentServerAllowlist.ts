/**
 * Parses the `ALLOWED_WORLDS_CONTENT_SERVER_HOSTS` config value (comma-separated hosts, set per
 * environment in the definitions repo) into a set of lowercased exact hostnames.
 *
 * Every listed host must resolve NAME ownership against the same chain and registry as the
 * default worlds server: world storage is keyed by world name only and the latest deploy from
 * any listed host decides where permissions are checked. Never reuse the catalyst list
 * (`ALLOWED_CONTENT_SERVER_HOSTS`), which includes third-party DAO catalysts.
 *
 * @param raw - The raw config value; blank or absent yields an empty set.
 * @returns The allowlisted hostnames.
 */
export function parseAllowedWorldsContentServerHosts(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(host => host.length > 0)
  )
}

/**
 * Parses a URL that must be a bare origin: HTTPS, no credentials, port, path, query or hash.
 * A single trailing slash is accepted.
 *
 * @param raw - The untrusted URL.
 * @returns `https://<host>` with the host lowercased, or null when not a bare origin.
 */
export function toBareOrigin(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    return null
  }

  return url.origin.toLowerCase()
}

/**
 * @param raw - A URL that may carry a path.
 * @returns Its lowercased origin, or null when it does not parse.
 */
export function originOf(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null
  }
  try {
    return new URL(raw).origin.toLowerCase()
  } catch {
    return null
  }
}

/**
 * @param url - A configured URL.
 * @returns Its lowercased origin.
 * @throws Error when the URL does not parse.
 */
export function requireOrigin(url: string): string {
  const origin = originOf(url)
  if (!origin) {
    throw new Error(`Invalid URL in configuration: ${url}`)
  }
  return origin
}

export type SourceRejectionReason = 'not_bare_origin' | 'not_allowlisted'

export type SourceContentServerResolution =
  | { ok: true; origin: string; source: string | null }
  | { ok: false; reason: SourceRejectionReason }

/**
 * Resolves a world event source (the `sourceContentServerUrl` message attribute or a recorded
 * source). The default server's origin resolves to `source: null` before the allowlist is
 * checked, so it is accepted even when not listed.
 *
 * @param raw - The untrusted source URL.
 * @param allowedHosts - Exact hostnames permitted as sources besides the default server.
 * @param defaultOrigin - The configured default worlds server origin.
 * @returns The normalized origin and the source to store (null = default), or the rejection reason.
 */
export function resolveSourceContentServerUrl(
  raw: unknown,
  allowedHosts: Set<string>,
  defaultOrigin: string
): SourceContentServerResolution {
  const origin = toBareOrigin(raw)
  if (!origin) {
    return { ok: false, reason: 'not_bare_origin' }
  }

  if (origin === defaultOrigin) {
    return { ok: true, origin, source: null }
  }

  if (!allowedHosts.has(new URL(origin).hostname)) {
    return { ok: false, reason: 'not_allowlisted' }
  }

  return { ok: true, origin, source: origin }
}
