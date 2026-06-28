export interface HTTPResponse<T = undefined> {
  status: number
  body?:
    | {
        message: string
      }
    | {
        value?: T
      }
}

/**
 * A response whose body is already-serialized JSON text, sent verbatim.
 *
 * Used by the storage value endpoints to avoid a redundant `JSON.stringify`: the value is read
 * from (or written to) Postgres as JSON text and spliced straight into the response body, so the
 * HTTP layer does not re-serialize it. The `@dcl/http-server` layer sends a string body as-is, so
 * the `Content-Type` must be set explicitly.
 */
export interface RawJSONResponse {
  status: number
  headers: { 'Content-Type': 'application/json' }
  body: string
}

/**
 * Pagination options for listing operations (used by storage adapters)
 */
export interface PaginationOptions {
  /** Maximum number of items to return */
  limit: number
  /** Number of items to skip (default: 0) */
  offset: number
  /** Optional case-sensitive prefix filter on key name */
  prefix?: string
}

/**
 * Pagination metadata for paginated list responses
 */
export interface PaginationMetadata {
  /** Number of items per page */
  limit: number
  /** Number of items skipped */
  offset: number
  /** Total count of matching items */
  total: number
}

/**
 * HTTP response for paginated list endpoints
 */
export interface HTTPPaginatedResponse<T> {
  status: number
  body: {
    data: T
    pagination: PaginationMetadata
  }
}

export interface StorageUsageResponse {
  usedBytes: number
  maxTotalSizeBytes: number
}

export interface HTTPStorageUsageResponse {
  status: number
  body: StorageUsageResponse
}

export type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }
