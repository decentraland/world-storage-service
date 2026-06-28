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
