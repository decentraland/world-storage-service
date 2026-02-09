import { getPaginationParams } from '@dcl/http-commons'

/**
 * Pagination parameters parsed from query string
 */
export interface ParsedPaginationParams {
  /** Maximum number of items to return */
  limit: number
  /** Number of items to skip */
  offset: number
  /** Optional case-sensitive prefix filter on key name */
  prefix?: string
}

/**
 * Configuration options for pagination parsing
 */
export interface PaginationConfig {
  /** Default number of items per page */
  defaultLimit: number
  /** Maximum number of items per page */
  maxLimit: number
}

/**
 * Parses and validates pagination parameters from query string
 *
 * Validates:
 * - limit: must be a positive integer, defaults to config.defaultLimit, capped at config.maxLimit
 * - offset: must be a non-negative integer, default 0
 * - prefix: optional string filter
 *
 * @param url - The request URL containing query parameters
 * @param config - Pagination configuration with defaultLimit and maxLimit
 * @returns Validated pagination options
 * @throws {InvalidRequestError} If limit or offset parameters are invalid
 */
export function parsePaginationParams(url: URL): ParsedPaginationParams {
  const prefix = url.searchParams.get('prefix') || undefined

  const { limit, offset } = getPaginationParams(url.searchParams)

  return { limit, offset, prefix }
}
