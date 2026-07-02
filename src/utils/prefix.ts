/**
 * Builds a case-sensitive LIKE pattern from a prefix string.
 *
 * LIKE metacharacters in the prefix are escaped so it always matches literally:
 * without this, `_` matches any single character (underscores are common in key
 * names), `%` matches any sequence, and a trailing `\` breaks the pattern.
 *
 * @param prefix - The optional prefix to convert into a SQL LIKE pattern
 * @returns A pattern with a trailing wildcard, or null if no prefix is provided
 */
export function buildPrefixPattern(prefix?: string): string | null {
  return prefix ? `${prefix.replace(/[\\%_]/g, '\\$&')}%` : null
}
