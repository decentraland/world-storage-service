/**
 * Parses the `ALLOWED_CONTENT_SERVER_HOSTS` config value (comma-separated hosts, set per
 * environment in the definitions repo) into a set of lowercased exact hostnames.
 *
 * @param raw - The raw config value; blank or absent yields an empty set.
 * @returns The allowlisted hostnames.
 */
export function parseAllowedContentServerHosts(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(host => host.length > 0)
  )
}

/**
 * Resolves an untrusted content server URL (e.g. an event's `contentServerUrls[0]`) to a
 * fetchable base URL, only when it is HTTPS, carries no credentials or explicit port, and
 * its host is exactly on the allowlist.
 *
 * @param raw - The untrusted URL.
 * @param allowedHosts - Exact hostnames permitted as fetch targets.
 * @returns The base URL without a trailing slash, query or fragment, or null when not allowed.
 */
export function resolveAllowedContentServerUrl(raw: unknown, allowedHosts: Set<string>): string | null {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    return null
  }

  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    return null
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}
