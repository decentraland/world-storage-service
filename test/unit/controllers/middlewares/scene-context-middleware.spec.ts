import { InvalidRequestError } from '@dcl/http-commons'
import {
  type SceneAuthMetadata,
  sceneContextMiddleware
} from '../../../../src/controllers/middlewares/scene-context-middleware'
import { PLACE_IDS, WORLD_NAMES } from '../../../fixtures'
import { createLogsMockedComponent } from '../../../mocks/components'
import { buildTestContext } from '../../utils/context'
import type { IPlacesComponent } from '../../../../src/adapters/places/types'
import type { BaseComponents } from '../../../../src/types'
import type { TestContext } from '../../utils/context'

describe('sceneContextMiddleware', () => {
  let ctx: TestContext
  let next: jest.Mock
  let result: { status: number; body?: { message: string } }
  let places: jest.Mocked<IPlacesComponent>

  beforeEach(() => {
    next = jest.fn()
    places = {
      resolvePlaceId: jest.fn().mockResolvedValue(PLACE_IDS.DEFAULT)
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function buildCtx(verification: { auth: string; authMetadata: SceneAuthMetadata }): TestContext {
    return buildTestContext({
      verification,
      components: {
        logs: createLogsMockedComponent(),
        places
      } as unknown as BaseComponents
    })
  }

  describe('when both realm name and parcel are missing', () => {
    beforeEach(() => {
      ctx = buildCtx({ auth: 'signature', authMetadata: {} })
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(sceneContextMiddleware(ctx, next)).rejects.toThrow(
        new InvalidRequestError('Request must include a realm name or a parcel')
      )
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when the realm name is empty and no parcel is provided', () => {
    let metadata: SceneAuthMetadata

    beforeEach(() => {
      metadata = { realm: { serverName: '' } }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(sceneContextMiddleware(ctx, next)).rejects.toThrow(
        new InvalidRequestError('Request must include a realm name or a parcel')
      )
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when only a parcel is provided (Genesis City admin tooling)', () => {
    let metadata: SceneAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      places.resolvePlaceId.mockResolvedValueOnce(PLACE_IDS.SCENE_A)
      metadata = { parcel: '-125,-96' }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      result = (await sceneContextMiddleware(ctx, next)) as { status: number }
    })

    it('should default the realm to Genesis City and resolve placeId', () => {
      expect(ctx.worldName).toBe('main')
      expect(ctx.parcel).toBe('-125,-96')
      expect(ctx.placeId).toBe(PLACE_IDS.SCENE_A)
      expect(places.resolvePlaceId).toHaveBeenCalledWith('main', '-125,-96')
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when a non-`.dcl.eth` realm name is provided (e.g. zone catalyst `artemis`)', () => {
    let metadata: SceneAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      places.resolvePlaceId.mockResolvedValueOnce(PLACE_IDS.SCENE_A)
      metadata = { realm: { serverName: 'artemis' }, parcel: '-125,-96' }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      result = (await sceneContextMiddleware(ctx, next)) as { status: number }
    })

    it('should normalize the realm to Genesis City so storage keys are consistent across callers', () => {
      expect(ctx.worldName).toBe('main')
      expect(places.resolvePlaceId).toHaveBeenCalledWith('main', '-125,-96')
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the world name is provided via realm.serverName', () => {
    let metadata: SceneAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      metadata = { realm: { serverName: WORLD_NAMES.DEFAULT } }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      result = (await sceneContextMiddleware(ctx, next)) as { status: number }
    })

    it('should set worldName and placeId on the context and call next', () => {
      expect(ctx.worldName).toBe(WORLD_NAMES.DEFAULT)
      expect(ctx.placeId).toBe(PLACE_IDS.DEFAULT)
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })

    it('should resolve the placeId via places component', () => {
      expect(places.resolvePlaceId).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, '0,0')
    })
  })

  describe('when the world name is provided via realmName fallback', () => {
    let metadata: SceneAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      metadata = { realmName: WORLD_NAMES.FALLBACK }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      result = (await sceneContextMiddleware(ctx, next)) as { status: number }
    })

    it('should set worldName and placeId on the context and call next', () => {
      expect(ctx.worldName).toBe(WORLD_NAMES.FALLBACK)
      expect(ctx.placeId).toBe(PLACE_IDS.DEFAULT)
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when metadata has a parcel', () => {
    let metadata: SceneAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      places.resolvePlaceId.mockResolvedValueOnce(PLACE_IDS.SCENE_A)
      metadata = { realm: { serverName: WORLD_NAMES.DEFAULT }, parcel: '10,20' }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      result = (await sceneContextMiddleware(ctx, next)) as { status: number }
    })

    it('should extract the parcel from metadata and resolve placeId', () => {
      expect(ctx.parcel).toBe('10,20')
      expect(ctx.placeId).toBe(PLACE_IDS.SCENE_A)
      expect(ctx.worldName).toBe(WORLD_NAMES.DEFAULT)
      expect(places.resolvePlaceId).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, '10,20')
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when metadata has no parcel', () => {
    let metadata: SceneAuthMetadata

    beforeEach(async () => {
      next.mockResolvedValue({ status: 200 })
      metadata = { realm: { serverName: WORLD_NAMES.DEFAULT } }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      result = (await sceneContextMiddleware(ctx, next)) as { status: number }
    })

    it('should default parcel to 0,0 and resolve placeId', () => {
      expect(ctx.parcel).toBe('0,0')
      expect(ctx.placeId).toBe(PLACE_IDS.DEFAULT)
      expect(ctx.worldName).toBe(WORLD_NAMES.DEFAULT)
      expect(places.resolvePlaceId).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, '0,0')
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the places component throws an error', () => {
    let metadata: SceneAuthMetadata

    beforeEach(() => {
      metadata = { realm: { serverName: WORLD_NAMES.DEFAULT } }
      ctx = buildCtx({ auth: 'signature', authMetadata: metadata })
      places.resolvePlaceId.mockRejectedValueOnce(new InvalidRequestError('Scene not found in Places API'))
    })

    it('should propagate the error', async () => {
      await expect(sceneContextMiddleware(ctx, next)).rejects.toThrow('Scene not found in Places API')
      expect(next).not.toHaveBeenCalled()
    })
  })
})
