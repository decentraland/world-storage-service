/**
 * Builds a case-insensitive LIKE pattern from a prefix string.
 *
 * @param prefix - The optional prefix to convert into a SQL LIKE pattern
 * @returns A lowercase pattern with a trailing wildcard, or null if no prefix is provided
 */
export function buildPrefixPattern(prefix?: string): string | null {
  return prefix ? `${prefix.toLowerCase()}%` : null
}
