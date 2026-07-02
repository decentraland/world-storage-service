import type { IHttpServerComponent } from '@dcl/core-commons'
import { createBodySizeLimitMiddleware } from '../../../../src/controllers/middlewares/body-size-limit-middleware'

describe('bodySizeLimitMiddleware', () => {
  const MAX_VALUE_SIZE_BYTES = 1000

  let middleware: ReturnType<typeof createBodySizeLimitMiddleware>
  let next: jest.Mock
  let nextResponse: IHttpServerComponent.IResponse

  beforeEach(() => {
    middleware = createBodySizeLimitMiddleware(MAX_VALUE_SIZE_BYTES)
    nextResponse = { status: 200 }
    next = jest.fn().mockResolvedValue(nextResponse)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function buildContext(contentLength: string | null, body: unknown = null): Parameters<typeof middleware>[0] {
    return {
      request: {
        headers: {
          get: jest.fn().mockReturnValue(contentLength)
        },
        body
      }
    } as unknown as Parameters<typeof middleware>[0]
  }

  function buildBodyStream(): { stream: AsyncIterable<Uint8Array>; consumed: () => boolean } {
    let fullyRead = false
    const stream: AsyncIterable<Uint8Array> = {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array(10)
        fullyRead = true
      }
    }
    return { stream, consumed: () => fullyRead }
  }

  describe('when the content length is within the limit', () => {
    it('should call next and return its response', async () => {
      const response = await middleware(buildContext('500'), next)

      expect(response).toBe(nextResponse)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('when the content length equals the limit plus the envelope slack', () => {
    it('should call next and return its response', async () => {
      const response = await middleware(buildContext(String(MAX_VALUE_SIZE_BYTES + 1024)), next)

      expect(response).toBe(nextResponse)
    })
  })

  describe('when the content length exceeds the limit within the drainable range', () => {
    let response: IHttpServerComponent.IResponse
    let bodyStream: ReturnType<typeof buildBodyStream>

    beforeEach(async () => {
      bodyStream = buildBodyStream()
      response = await middleware(buildContext(String(MAX_VALUE_SIZE_BYTES + 1025), bodyStream.stream), next)
    })

    it('should respond with a 413 and a payload too large message', () => {
      expect(response).toEqual({
        status: 413,
        body: {
          error: 'Payload Too Large',
          message: `Request body exceeds the maximum allowed size (${MAX_VALUE_SIZE_BYTES + 1024} bytes)`
        }
      })
    })

    it('should drain the request body so the connection stays usable', () => {
      expect(bodyStream.consumed()).toBe(true)
    })

    it('should not call next', () => {
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when the content length grossly exceeds the drain limit', () => {
    let response: IHttpServerComponent.IResponse
    let bodyStream: ReturnType<typeof buildBodyStream>

    beforeEach(async () => {
      bodyStream = buildBodyStream()
      response = await middleware(buildContext(String(5 * 1024 * 1024), bodyStream.stream), next)
    })

    it('should respond with a 413 that closes the connection without reading the body', () => {
      expect(response).toMatchObject({ status: 413, headers: { connection: 'close' } })
      expect(bodyStream.consumed()).toBe(false)
    })
  })

  describe('when the content length header is missing', () => {
    let response: IHttpServerComponent.IResponse

    beforeEach(async () => {
      response = await middleware(buildContext(null), next)
    })

    it('should respond with a 411 that closes the connection', () => {
      expect(response).toEqual({
        status: 411,
        headers: { connection: 'close' },
        body: {
          error: 'Length Required',
          message: 'Requests with a body must include a valid Content-Length header'
        }
      })
    })

    it('should not call next', () => {
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when the content length header is not a number', () => {
    let response: IHttpServerComponent.IResponse

    beforeEach(async () => {
      response = await middleware(buildContext('not-a-number'), next)
    })

    it('should respond with a 411 and a length required message', () => {
      expect(response).toMatchObject({ status: 411 })
    })
  })
})
