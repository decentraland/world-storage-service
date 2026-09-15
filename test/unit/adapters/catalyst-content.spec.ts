import type { ICacheStorageComponent, IFetchComponent } from '@dcl/core-commons'
import { createConfigMockedComponent, createFetchMockedComponent } from '@dcl/core-commons'
import { createCatalystContentComponent } from '../../../src/adapters/catalyst-content'
import { ADDRESSES, PARCELS } from '../../fixtures'
import { createCacheMockedComponent, createLogsMockedComponent } from '../../mocks/components'
import type { ICatalystContentComponent } from '../../../src/adapters/catalyst-content/types'
import type { WorldScene } from '../../../src/adapters/worlds-content-server/types'

describe('CatalystContentComponent', () => {
  const contentUrl = 'https://peer.decentraland.org/content'
  const FETCH_OPTIONS = { timeout: 5000, attempts: 3, retryDelay: 200 }

  let config: ReturnType<typeof createConfigMockedComponent>
  let fetcher: jest.Mocked<IFetchComponent>
  let cache: jest.Mocked<ICacheStorageComponent>
  let component: ICatalystContentComponent

  function mockResponse(response: Partial<Response>): Response {
    return response as Response
  }

  interface EntityOverrides {
    id: string
    base: string
    parcels: string[]
    title: string | undefined
    logsPermissions: unknown
  }

  function buildEntity(overrides: Partial<EntityOverrides> = {}) {
    return {
      id: overrides.id ?? 'scene-entity-id',
      pointers: overrides.parcels ?? [PARCELS.GENESIS_CITY],
      metadata: {
        display: overrides.title === undefined ? undefined : { title: overrides.title },
        scene: { base: overrides.base ?? PARCELS.GENESIS_CITY, parcels: overrides.parcels ?? [PARCELS.GENESIS_CITY] },
        logsPermissions: overrides.logsPermissions ?? [ADDRESSES.AUTHORIZED]
      }
    }
  }

  beforeEach(async () => {
    config = createConfigMockedComponent({
      getNumber: jest.fn().mockResolvedValue(undefined),
      requireString: jest.fn().mockResolvedValue(contentUrl)
    })
    fetcher = createFetchMockedComponent() as jest.Mocked<IFetchComponent>
    cache = createCacheMockedComponent()
    cache.get.mockResolvedValue(null)

    component = await createCatalystContentComponent({
      fetcher,
      config,
      cache,
      logs: createLogsMockedComponent()
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when resolving the active scene entity for a parcel', () => {
    describe('and the fetch is successful with a matching entity', () => {
      let entity: ReturnType<typeof buildEntity>

      beforeEach(() => {
        entity = buildEntity({ title: 'My Scene' })
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue([entity])
          })
        )
      })

      it('should call the catalyst content server with the active entities POST request', async () => {
        await component.getActiveSceneEntity(PARCELS.GENESIS_CITY)

        expect(fetcher.fetch).toHaveBeenCalledWith(`${contentUrl}/entities/active`, {
          ...FETCH_OPTIONS,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pointers: [PARCELS.GENESIS_CITY] })
        })
      })

      it('should return the mapped scene', async () => {
        const result = await component.getActiveSceneEntity(PARCELS.GENESIS_CITY)

        const expected: WorldScene = {
          sceneId: entity.id,
          base: PARCELS.GENESIS_CITY,
          parcels: [PARCELS.GENESIS_CITY],
          title: 'My Scene',
          deployedAt: 0,
          logsPermissions: [ADDRESSES.AUTHORIZED.toLowerCase()]
        }
        expect(result).toEqual(expected)
      })

      it('should cache the resolved scene', async () => {
        await component.getActiveSceneEntity(PARCELS.GENESIS_CITY)

        expect(cache.set).toHaveBeenCalledWith(
          `catalyst-scene:${PARCELS.GENESIS_CITY}`,
          expect.objectContaining({ sceneId: entity.id }),
          30
        )
      })
    })

    describe('and the entity has no display title', () => {
      beforeEach(() => {
        const entity = buildEntity()
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue([entity])
          })
        )
      })

      it('should default the title to null', async () => {
        const result = await component.getActiveSceneEntity(PARCELS.GENESIS_CITY)

        expect(result?.title).toBeNull()
      })
    })

    describe('and the response has no entity matching the parcel', () => {
      beforeEach(() => {
        const entity = buildEntity({ parcels: [PARCELS.SCENE_A] })
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue([entity])
          })
        )
      })

      it('should return null', async () => {
        const result = await component.getActiveSceneEntity(PARCELS.GENESIS_CITY)

        expect(result).toBeNull()
      })
    })

    describe('and the matching entity is missing metadata.scene', () => {
      beforeEach(() => {
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest
              .fn()
              .mockResolvedValue([{ id: 'scene-entity-id', pointers: [PARCELS.GENESIS_CITY], metadata: {} }])
          })
        )
      })

      it('should throw an error indicating an unexpected shape', async () => {
        await expect(component.getActiveSceneEntity(PARCELS.GENESIS_CITY)).rejects.toThrow(
          `Catalyst content server returned an entity with an unexpected shape for parcel ${PARCELS.GENESIS_CITY}`
        )
      })
    })

    describe('and the response is an empty array', () => {
      beforeEach(() => {
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue([])
          })
        )
      })

      it('should return null', async () => {
        const result = await component.getActiveSceneEntity(PARCELS.GENESIS_CITY)

        expect(result).toBeNull()
      })
    })

    describe('and the response payload is not an array', () => {
      beforeEach(() => {
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue({ unexpected: true })
          })
        )
      })

      it('should throw an error about the unexpected payload', async () => {
        await expect(component.getActiveSceneEntity(PARCELS.GENESIS_CITY)).rejects.toThrow(/unexpected payload/)
      })
    })

    describe('and the catalyst content server returns a non-OK response', () => {
      beforeEach(() => {
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: false,
            status: 500
          })
        )
      })

      it('should throw an error', async () => {
        await expect(component.getActiveSceneEntity(PARCELS.GENESIS_CITY)).rejects.toThrow(
          `Failed to fetch active scene entity for parcel ${PARCELS.GENESIS_CITY}`
        )
      })
    })

    describe('and the fetch throws a network error', () => {
      beforeEach(() => {
        fetcher.fetch.mockRejectedValueOnce(new Error('Network error'))
      })

      it('should throw an error indicating a network error', async () => {
        await expect(component.getActiveSceneEntity(PARCELS.GENESIS_CITY)).rejects.toThrow(
          `Failed to fetch active scene entity for parcel ${PARCELS.GENESIS_CITY}: network error`
        )
      })
    })

    describe('and the scene is already cached', () => {
      const cachedScene: WorldScene = {
        sceneId: 'cached-scene-id',
        base: PARCELS.GENESIS_CITY,
        parcels: [PARCELS.GENESIS_CITY],
        title: null,
        deployedAt: 0,
        logsPermissions: []
      }

      beforeEach(() => {
        cache.get.mockResolvedValueOnce(cachedScene)
      })

      it('should return the cached value without calling the catalyst content server', async () => {
        const result = await component.getActiveSceneEntity(PARCELS.GENESIS_CITY)

        expect(result).toEqual(cachedScene)
        expect(fetcher.fetch).not.toHaveBeenCalled()
      })
    })
  })
})
