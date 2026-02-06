import { InvalidRequestError } from '@dcl/http-commons'

/**
 * Pagination parameters parsed from query string
 */
export interface ParsedPaginationParams {
  /** Maximum number of items to return */
  limit: number
  /** Number of items to skip */
  offset: number
  /** Optional case-insensitive prefix filter on key name */
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
export function parsePaginationParams(url: URL, config: PaginationConfig): ParsedPaginationParams {
  const { defaultLimit, maxLimit } = config
  const limitParam = url.searchParams.get('limit')
  const offsetParam = url.searchParams.get('offset')
  const prefix = url.searchParams.get('prefix') || undefined

  let limit = defaultLimit
  if (limitParam !== null) {
    limit = parseInt(limitParam, 10)
    if (isNaN(limit) || limit < 1) {
      throw new InvalidRequestError('limit must be a positive integer')
    }
    if (limit > maxLimit) {
      throw new InvalidRequestError(`limit cannot exceed ${maxLimit}`)
    }
  }

  let offset = 0
  if (offsetParam !== null) {
    offset = parseInt(offsetParam, 10)
    if (isNaN(offset) || offset < 0) {
      throw new InvalidRequestError('offset must be a non-negative integer')
    }
  }

  return { limit, offset, prefix }
}
