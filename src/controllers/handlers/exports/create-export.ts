import type { IHttpServerComponent } from '@dcl/core-commons'
import { InvalidRequestError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parseExportFormat } from '../commons/parseExportFormat'
import { parseExportSelection } from '../commons/parseExportSelection'
import type { WorldHandlerContextWithPath } from '../../../types'

/**
 * Handler for streaming an export of the scene's world and player storage.
 *
 * @param context - Request context with the format query and the optional selection body
 * @returns 200 with the gzipped JSON or CSV stream, or 429 while another export of the scene is streaming
 */
export async function createExportHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'storageExport', '/exports'>,
    'url' | 'components' | 'worldName' | 'placeId' | 'request'
  >
): Promise<IHttpServerComponent.IResponse> {
  const {
    url,
    request,
    worldName,
    placeId,
    components: { logs, storageExport }
  } = context

  const logger = logs.getLogger('create-export-handler')

  try {
    const format = parseExportFormat(url)
    const selection = parseExportSelection(await request.text())
    const result = storageExport.openExport({ worldName, placeId }, selection, format)

    if (result.kind === 'limit-reached') {
      logger.info('Export rejected: one already in progress', { worldName, placeId })
      return {
        status: 429,
        body: {
          error: 'Too Many Requests',
          message: 'An export of this scene is already in progress; try again shortly'
        }
      }
    }

    logger.info('Export started', { worldName, placeId, format })

    return {
      status: 200,
      headers: {
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Disposition': `attachment; filename="storage-export.${format}"`,
        'Cache-Control': 'no-store'
      },
      body: result.stream
    }
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      throw error
    }

    logger.error('Error creating export', { worldName, placeId, error: errorMessageOrDefault(error, 'Unknown error') })

    throw error
  }
}
