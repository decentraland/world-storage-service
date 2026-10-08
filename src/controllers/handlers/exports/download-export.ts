import { Readable } from 'node:stream'
import type { ILoggerComponent } from '@well-known-components/interfaces'
import type { IHttpServerComponent } from '@dcl/core-commons'
import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { NotFoundError } from '@dcl/http-commons'
import { getExportJobScope } from './export-job-scope'
import { errorMessageOrDefault } from '../../../utils/errors'
import type { WorldHandlerContextWithPath } from '../../../types'

async function* checkedContent(
  chunks: AsyncGenerator<Buffer>,
  expectedBytes: number,
  logger: ILoggerComponent.ILogger,
  jobId: string
): AsyncGenerator<Buffer> {
  let receivedBytes = 0
  for await (const chunk of chunks) {
    receivedBytes += chunk.length
    yield chunk
  }
  if (receivedBytes !== expectedBytes) {
    logger.warn('Export content ended early', { jobId })
    throw new Error('Export content ended early')
  }
}

/**
 * Handler for downloading the gzipped file of one of the signer's finished exports of the scene.
 *
 * @param context - Request context with the job id, the scene and the signer
 * @returns The streamed gzip file, or 409 while the export is not done
 * @throws {NotFoundError} If the job is unknown, expired, or owned by another scene or signer
 */
export async function downloadExportHandler(
  context: Pick<
    WorldHandlerContextWithPath<'logs' | 'exportJobs', '/exports/:id/download'>,
    'params' | 'components' | 'worldName' | 'placeId'
  > &
    Pick<DecentralandSignatureContext, 'verification'>
): Promise<IHttpServerComponent.IResponse> {
  const {
    params,
    worldName,
    placeId,
    components: { logs, exportJobs }
  } = context

  const logger = logs.getLogger('download-export-handler')
  const scope = getExportJobScope(context)

  try {
    const job = await exportJobs.getForScene(scope, params.id)
    if (!job) {
      throw new NotFoundError('Export not found')
    }

    if (job.status !== 'done') {
      return { status: 409, body: { error: 'Conflict', message: 'Export is not ready' } }
    }

    logger.info('Export download started', { worldName, placeId, jobId: job.id, sizeBytes: job.sizeBytes ?? 0 })

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(job.sizeBytes),
        'Content-Disposition': `attachment; filename="storage-export.${job.format}.gz"`
      },
      body: Readable.from(checkedContent(exportJobs.streamContent(scope, job.id), job.sizeBytes ?? 0, logger, job.id), {
        highWaterMark: 1
      })
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error
    }

    logger.error('Error downloading export', {
      worldName,
      placeId,
      error: errorMessageOrDefault(error, 'Unknown error')
    })

    throw error
  }
}
