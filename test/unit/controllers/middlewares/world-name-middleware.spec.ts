import { InvalidRequestError } from '@dcl/http-commons'
import {
  type WorldAuthMetadata,
  worldNameMiddleware
} from '../../../../src/controllers/middlewares/world-name-middleware'
import { WORLD_NAMES } from '../../../fixtures'
import { createLogsMockedComponent } from '../../../mocks/components'
import { buildTestContext } from '../../utils/context'
import type { BaseComponents } from '../../../../src/types'
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

  function buildCtx(verification: { auth: string; authMetadata: WorldAuthMetadata }): TestContext {
    return buildTestContext({
      verification,
      components: {
        logs: createLogsMockedComponent()
      } as unknown as BaseComponents
    })
  }

  describe('when the world name is missing', () => {
    beforeEach(() => {
      ctx = buildCtx({ auth: 'signature', authMetadata: {} })
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(worldNameMiddleware(ctx, next)).rejects.toThrow(new InvalidRequestError('World name is required'))
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when the world name is empty', () => {
    let metadata: WorldAuthMetadata

    beforeEach(() => {
      metadata = { realm: { serverName: '' } }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(worldNameMiddleware(ctx, next)).rejects.toThrow(new InvalidRequestError('World name is required'))
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when the world name is provided via realm.serverName', () => {
    let metadata: WorldAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      metadata = { realm: { serverName: WORLD_NAMES.DEFAULT } }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      result = (await worldNameMiddleware(ctx, next)) as { status: number }
    })

    it('should set worldName on the context and call next', () => {
      expect(ctx.worldName).toBe(WORLD_NAMES.DEFAULT)
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the world name is provided via realmName fallback', () => {
    let metadata: WorldAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      metadata = { realmName: WORLD_NAMES.FALLBACK }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      result = (await worldNameMiddleware(ctx, next)) as { status: number }
    })

    it('should set worldName on the context and call next', () => {
      expect(ctx.worldName).toBe(WORLD_NAMES.FALLBACK)
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })
})
