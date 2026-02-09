/**
 * Builds a case-sensitive LIKE pattern from a prefix string.
 *
 * @param prefix - The optional prefix to convert into a SQL LIKE pattern
 * @returns A pattern with a trailing wildcard, or null if no prefix is provided
 */
export function buildPrefixPattern(prefix?: string): string | null {
  return prefix ? `${prefix}%` : null
}
