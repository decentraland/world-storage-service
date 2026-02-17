/**
 * Calculates the size in bytes of a serialized value using UTF-8 encoding.
 *
 * This is the single source of truth for how value sizes are measured across
 * the application — both when storing (adapters) and when validating (storage limits).
 * Callers are responsible for serializing the value before calling this function
 * (e.g. JSON.stringify for JSONB values, raw string for env values).
 *
 * @param serializedValue - The string to measure
 * @returns The byte length of the string in UTF-8 encoding
 */
export function calculateValueSizeInBytes(serializedValue: string): number {
  return Buffer.byteLength(serializedValue, 'utf-8')
}
