import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { NotFoundError } from '@dcl/http-commons'
import { getExportJobScope } from './export-job-scope'
import { serializeExportJob } from './serialize-export-job'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { SerializedExportJob } from './serialize-export-job'
import type { WorldHandlerContextWithPath } from '../../../types'

/**
 * Handler for reading the status of one of the signer's exports of the scene.
 *
 * @param context - Request context with the job id, the scene and the signer
 * @returns The export job
 * @throws {NotFoundError} If the job is unknown, expired, or owned by another scene or signer
 */
export async function getExportHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'exportJobs', '/exports/:id'>,
    'params' | 'components' | 'worldName' | 'placeId'
  > &
    Pick<DecentralandSignatureContext, 'verification'>
): Promise<{ status: number; body: SerializedExportJob }> {
  const {
    params,
    worldName,
    placeId,
    components: { logs, exportJobs }
  } = context

  const logger = logs.getLogger('get-export-handler')
  const scope = getExportJobScope(context)

  try {
    const job = await exportJobs.getForScene(scope, params.id)
    if (!job) {
      throw new NotFoundError('Export not found')
    }

    return { status: 200, body: serializeExportJob(job) }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error
    }

    logger.error('Error getting export', { worldName, placeId, error: errorMessageOrDefault(error, 'Unknown error') })

    throw error
  }
}
