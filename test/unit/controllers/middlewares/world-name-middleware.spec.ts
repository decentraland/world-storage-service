import {
  type WorldAuthMetadata,
  worldNameMiddleware
} from '../../../../src/controllers/middlewares/world-name-middleware'
import { buildTestContext } from '../../utils/context'
import type { TestContext } from '../../utils/context'

describe('worldNameMiddleware', () => {
  let ctx: TestContext
  let next: jest.Mock
  let result: { status: number; body?: { message: string } }

  beforeEach(() => {
    next = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when the world name is missing', () => {
    beforeEach(async () => {
      ctx = buildTestContext({ verification: { auth: 'signature', authMetadata: {} } })
      result = (await worldNameMiddleware(ctx, next)) as { status: number; body: { message: string } }
    })

    it('should respond with a 400 status and an error message', () => {
      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 400,
        body: { message: 'World name is required' }
      })
    })
  })

  describe('when the world name is empty', () => {
    let metadata: WorldAuthMetadata

    beforeEach(async () => {
      metadata = { realm: { serverName: '' } }
      ctx = buildTestContext({ verification: { auth: 'signature', authMetadata: metadata } })
      result = (await worldNameMiddleware(ctx, next)) as { status: number; body: { message: string } }
    })

    it('should respond with a 400 status and an error message', () => {
      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 400,
        body: { message: 'World name is required' }
      })
    })
  })

  describe('when the world name is provided via realm.serverName', () => {
    let metadata: WorldAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      metadata = { realm: { serverName: 'example.dcl.eth' } }
      ctx = buildTestContext({ verification: { auth: 'signature', authMetadata: metadata } })
      result = (await worldNameMiddleware(ctx, next)) as { status: number }
    })

    it('should set worldName on the context and call next', () => {
      expect(ctx.worldName).toBe('example.dcl.eth')
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the world name is provided via realmName fallback', () => {
    let metadata: WorldAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      metadata = { realmName: 'fallback.dcl.eth' }
      ctx = buildTestContext({ verification: { auth: 'signature', authMetadata: metadata } })
      result = (await worldNameMiddleware(ctx, next)) as { status: number }
    })

    it('should set worldName on the context and call next', () => {
      expect(ctx.worldName).toBe('fallback.dcl.eth')
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })
})
