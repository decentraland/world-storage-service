/**
 * @param value - Untrusted array-ish value.
 * @returns Only the string entries of `value`, or [] when it is not an array.
 */
export function filterStringEntries(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/**
 * @param metadata - A scene/world entity's metadata.
 * @returns The lowercased `logsPermissions` string entries, or [] when absent/malformed.
 */
export function extractLogsPermissions(metadata: unknown): string[] {
  return filterStringEntries((metadata as { logsPermissions?: unknown } | undefined)?.logsPermissions).map(entry =>
    entry.toLowerCase()
  )
}
