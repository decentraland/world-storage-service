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
