import type { IHttpServerComponent } from '@dcl/core-commons'
import type { GlobalContext } from '../../types'

/**
 * Slack added on top of the per-value limit for the JSON request envelope
 * (`{"value":...}` plus whitespace).
 */
const BODY_ENVELOPE_SLACK_BYTES = 1024

/**
 * Oversized bodies up to this size are read and discarded before responding, so
 * well-behaved clients receive the 413 cleanly instead of an EPIPE when the server
 * closes the socket mid-upload. Anything larger is treated as abuse and the
 * connection is closed without reading it.
 */
const DRAIN_LIMIT_BYTES = 4 * 1024 * 1024

/**
 * Creates a middleware that rejects oversized request bodies before they are read.
 *
 * Without this cap the schema validator (and the handler) buffer and `JSON.parse` the
 * entire body before the storage-limits check runs, so any caller able to sign a request
 * could exhaust memory/CPU with a multi-hundred-MB body. The check runs on the declared
 * `Content-Length` — Node's HTTP parser enforces that the actual body does not exceed the
 * declared length, so the header can be trusted as an upper bound. Bodies without a
 * `Content-Length` (chunked) cannot be size-checked before buffering and are rejected.
 *
 * @param maxValueSizeBytes - The per-value size limit of the route's storage namespace
 * @returns A middleware that responds 411/413 for missing/oversized bodies
 */
export function createBodySizeLimitMiddleware(
  maxValueSizeBytes: number
): IHttpServerComponent.IRequestHandler<IHttpServerComponent.PathAwareContext<GlobalContext, string>> {
  const maxBodySizeBytes = maxValueSizeBytes + BODY_ENVELOPE_SLACK_BYTES

  return async (ctx, next) => {
    const contentLengthHeader = ctx.request.headers.get('content-length')
    // `Number(null)` would be 0, silently letting header-less (chunked) bodies through.
    const contentLength = contentLengthHeader === null ? NaN : Number(contentLengthHeader)

    // Rejections that skip reading the request body leave the unread bytes on the socket;
    // `Connection: close` makes the server drop it instead of letting a keep-alive client
    // reuse a desynced connection.
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return {
        status: 411,
        headers: { connection: 'close' },
        body: {
          error: 'Length Required',
          message: 'Requests with a body must include a valid Content-Length header'
        }
      }
    }

    if (contentLength > maxBodySizeBytes) {
      const response = {
        status: 413,
        body: {
          error: 'Payload Too Large',
          message: `Request body exceeds the maximum allowed size (${maxBodySizeBytes} bytes)`
        }
      }

      if (contentLength <= DRAIN_LIMIT_BYTES && ctx.request.body) {
        try {
          // Discard the body chunk by chunk (never buffered as a whole) so the client can
          // finish the upload and read the response; the connection stays usable.
          for await (const chunk of ctx.request.body) {
            void chunk
          }
          return response
        } catch {
          // The client aborted mid-upload; the connection is unusable either way.
        }
      }

      return { ...response, headers: { connection: 'close' } }
    }

    return next()
  }
}
