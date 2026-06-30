import type { RawJSONResponse } from '../types/http'

/**
 * Builds a `{ "value": <json> }` 200 response from an already-serialized JSON string.
 *
 * The value text is spliced verbatim into the body, so the HTTP layer does not run a second
 * `JSON.stringify` over a payload that came straight from Postgres (read path) or from the single
 * serialization done during validation (write path).
 *
 * @param serializedValue - Valid JSON text for the stored value (e.g. `"42"`, `"\"hi\""`, `"{...}"`)
 * @returns A response with the JSON content type and a raw string body
 */
export function rawJsonValueResponse(serializedValue: string): RawJSONResponse {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: `{"value":${serializedValue}}`
  }
}

/**
 * Builds a `{ "data": <json array>, "pagination": {...} }` 200 response from an already-serialized
 * `data` array string.
 *
 * The array text is spliced verbatim so the list payload isn't re-serialized by the HTTP layer.
 * `limit`/`offset`/`total` are validated integers, so they are safe to interpolate directly.
 *
 * @param serializedData - Valid JSON array text (e.g. `[{"key":"k","value":1}]`)
 * @param pagination - The pagination metadata to embed
 * @returns A response with the JSON content type and a raw string body
 */
export function rawJsonPaginatedResponse(
  serializedData: string,
  pagination: { limit: number; offset: number; total: number }
): RawJSONResponse {
  const { limit, offset, total } = pagination
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: `{"data":${serializedData},"pagination":{"limit":${limit},"offset":${offset},"total":${total}}}`
  }
}
