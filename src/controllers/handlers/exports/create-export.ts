import type { IHttpServerComponent } from '@dcl/core-commons'
import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { InvalidRequestError } from '@dcl/http-commons'
import { getExportJobScope } from './export-job-scope'
import { errorMessageOrDefault } from '../../../utils/errors'
import { parseExportFormat } from '../commons/parseExportFormat'
import { parseExportSelection } from '../commons/parseExportSelection'
import type { WorldHandlerContextWithPath } from '../../../types'

/**
 * Handler for requesting an export of the scene's world and player storage.
 *
 * @param context - Request context with the format query, the optional selection body and the signer
 * @returns 202 with the new or reused job, or 429 when the signer or scene has too many exports in flight
 */
export async function createExportHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'exportJobs', '/exports'>,
    'url' | 'components' | 'worldName' | 'placeId' | 'request'
  > &
    Pick<DecentralandSignatureContext, 'verification'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    url,
    request,
    worldName,
    placeId,
    components: { logs, exportJobs }
  } = context

  const logger = logs.getLogger('create-export-handler')
  const scope = getExportJobScope(context)

  try {
    const format = parseExportFormat(url)
    const selection = parseExportSelection(await request.text())
    const result = await exportJobs.create(scope, format, selection)

    if (result.kind === 'limit-reached') {
      logger.info('Export rejected: too many in progress', { worldName, placeId })
      return {
        status: 429,
        body: {
          error: 'Too Many Requests',
          message: 'Too many exports in progress for this scene; wait for one to finish'
        }
      }
    }

    logger.info('Export requested', { worldName, placeId, jobId: result.job.id })

    return { status: 202, body: { id: result.job.id, status: result.job.status } }
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      throw error
    }

    logger.error('Error creating export', { worldName, placeId, error: errorMessageOrDefault(error, 'Unknown error') })

    throw error
  }
}
