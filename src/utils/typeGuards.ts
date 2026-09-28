/**
 * @param value - Any untrusted value.
 * @returns Whether `value` is a non-null object that can be indexed by key.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * @param values - Candidate values, in precedence order.
 * @returns The first non-empty string, or `undefined` when there is none.
 */
export function pickString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0)
}
