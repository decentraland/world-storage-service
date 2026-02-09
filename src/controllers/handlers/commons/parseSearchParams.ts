import { getPaginationParams } from '@dcl/http-commons'
import { PaginatedParameters } from '@dcl/schemas'

/**
 * Search parameters parsed from query string
 */
export type ParsedSearchParams = Required<PaginatedParameters> & {
  /** Optional case-sensitive prefix filter on key name */
  prefix?: string
}

/**
 * Parses and validates search parameters from query string
 *
 * Validates:
 * - limit: must be a positive integer, defaults to config.defaultLimit, capped at config.maxLimit
 * - offset: must be a non-negative integer, default 0
 * - prefix: optional string filter
 *
 * @param url - The request URL containing query parameters
 * @returns Validated search options
 * @throws {InvalidRequestError} If limit or offset parameters are invalid
 */
export function parseSearchParams(url: URL): ParsedSearchParams {
  const prefix = url.searchParams.get('prefix') || undefined

  const { limit, offset } = getPaginationParams(url.searchParams)

  return { limit, offset, prefix }
}
