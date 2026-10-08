import { InvalidRequestError } from '@dcl/http-commons'
import type { ExportFormat } from '../../../adapters/export-jobs'

/** Reads the required `format` query parameter, allowlisted to `json` or `csv`. */
export function parseExportFormat(url: URL): ExportFormat {
  const formats = url.searchParams.getAll('format')
  if (formats.length === 1 && (formats[0] === 'json' || formats[0] === 'csv')) {
    return formats[0]
  }
  throw new InvalidRequestError('format must be one of: json, csv')
}
