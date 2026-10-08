import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { getExportJobScope } from './export-job-scope'
import { serializeExportJob } from './serialize-export-job'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { SerializedExportJob } from './serialize-export-job'
import type { WorldHandlerContextWithPath } from '../../../types'

/**
 * Handler for listing the signer's non-expired exports of the scene, newest first.
 *
 * @param context - Request context with the scene and the signer
 * @returns The signer's export jobs
 */
export async function listExportsHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'exportJobs', '/exports'>,
    'components' | 'worldName' | 'placeId'
  > &
    Pick<DecentralandSignatureContext, 'verification'>
): Promise<{ status: number; body: { data: SerializedExportJob[] } }> {
  const {
    worldName,
    placeId,
    components: { logs, exportJobs }
  } = context

  const logger = logs.getLogger('list-exports-handler')
  const scope = getExportJobScope(context)

  try {
    const jobs = await exportJobs.listForScene(scope)

    logger.debug('Exports listed', { worldName, placeId, count: jobs.length })

    return { status: 200, body: { data: jobs.map(serializeExportJob) } }
  } catch (error) {
    logger.error('Error listing exports', { worldName, placeId, error: errorMessageOrDefault(error, 'Unknown error') })

    throw error
  }
}
