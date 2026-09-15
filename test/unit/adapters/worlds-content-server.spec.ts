import type { ICacheStorageComponent } from '@dcl/core-commons'
import { createWorldsContentServerComponent } from '../../../src/adapters/worlds-content-server'
import { ADDRESSES, PARCELS, WORLD_NAMES } from '../../fixtures'
import { createCacheMockedComponent, createLogsMockedComponent } from '../../mocks/components'
import type {
  IWorldsContentServerComponent,
  WorldPermissions,
  WorldScene
} from '../../../src/adapters/worlds-content-server'
import type { AppComponents } from '../../../src/types'

describe('Worlds Content Server Component', () => {
  const WORLDS_CONTENT_SERVER_URL = 'https://worlds-content-server.decentraland.org'
  const FETCH_OPTIONS = { timeout: 5000, attempts: 3, retryDelay: 200 }

  let fetchMock: jest.Mock
  let configRequireString: jest.Mock
  let cache: jest.Mocked<ICacheStorageComponent>

  beforeEach(() => {
    fetchMock = jest.fn()
    configRequireString = jest.fn().mockResolvedValue(WORLDS_CONTENT_SERVER_URL)
    cache = createCacheMockedComponent()
    cache.get.mockResolvedValue(null)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function buildMockPermissions(): WorldPermissions {
    return {
      owner: ADDRESSES.OWNER,
      permissions: {
        deployment: { type: 'allow-list', wallets: [ADDRESSES.UNAUTHORIZED] }
      }
    }
  }

  async function createComponent(): Promise<IWorldsContentServerComponent> {
    return createWorldsContentServerComponent({
      fetcher: { fetch: fetchMock },
      config: { requireString: configRequireString, getNumber: jest.fn().mockResolvedValue(undefined) },
      cache,
      logs: createLogsMockedComponent()
    } as unknown as AppComponents)
  }

  describe('when getting world permissions', () => {
    describe('and the fetch is successful', () => {
      let component: IWorldsContentServerComponent
      let mockPermissions: WorldPermissions

      beforeEach(async () => {
        mockPermissions = buildMockPermissions()
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPermissions)
        })
        component = await createComponent()
      })

      it('should return the world permissions', async () => {
        const result = await component.getPermissions(WORLD_NAMES.DEFAULT)

        expect(result).toEqual(mockPermissions)
      })
    })

    describe('and the world name contains special characters', () => {
      let component: IWorldsContentServerComponent
      const specialWorldName = WORLD_NAMES.WITH_SPECIAL_CHARS

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(buildMockPermissions())
        })
        component = await createComponent()
      })

      it('should encode the world name in the URL', async () => {
        await component.getPermissions(specialWorldName)

        expect(fetchMock).toHaveBeenCalledWith(
          `${WORLDS_CONTENT_SERVER_URL}/world/${encodeURIComponent(specialWorldName)}/permissions`,
          FETCH_OPTIONS
        )
      })
    })

    describe('and the fetch fails', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 404
        })
        component = await createComponent()
      })

      it('should throw an error with the world name', async () => {
        await expect(component.getPermissions(WORLD_NAMES.DEFAULT)).rejects.toThrow(
          `Failed to fetch world permissions for ${WORLD_NAMES.DEFAULT}`
        )
      })
    })

    describe('and the fetch throws a network error', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network error'))
        component = await createComponent()
      })

      it('should throw an error indicating network error', async () => {
        await expect(component.getPermissions(WORLD_NAMES.DEFAULT)).rejects.toThrow(
          `Failed to fetch world permissions for ${WORLD_NAMES.DEFAULT}: network error`
        )
      })
    })

    describe('and the permissions are cached', () => {
      let component: IWorldsContentServerComponent
      let cachedPermissions: WorldPermissions

      beforeEach(async () => {
        cachedPermissions = buildMockPermissions()
        cache.get.mockResolvedValueOnce(cachedPermissions)
        component = await createComponent()
      })

      it('should return the cached permissions without fetching', async () => {
        const result = await component.getPermissions(WORLD_NAMES.DEFAULT)

        expect(result).toEqual(cachedPermissions)
        expect(fetchMock).not.toHaveBeenCalled()
      })
    })

    describe('and the fetch succeeds', () => {
      let component: IWorldsContentServerComponent
      let mockPermissions: WorldPermissions

      beforeEach(async () => {
        mockPermissions = buildMockPermissions()
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPermissions)
        })
        component = await createComponent()
      })

      it('should cache the permissions with the configured TTL', async () => {
        await component.getPermissions(WORLD_NAMES.DEFAULT)

        expect(cache.set).toHaveBeenCalledWith(`world-permissions:${WORLD_NAMES.DEFAULT}`, mockPermissions, 30)
      })
    })

    describe('and the response payload has an unexpected shape', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ permissions: {} })
        })
        component = await createComponent()
      })

      it('should throw an error indicating an unexpected payload', async () => {
        await expect(component.getPermissions(WORLD_NAMES.DEFAULT)).rejects.toThrow(
          `Worlds content server returned an unexpected permissions payload for ${WORLD_NAMES.DEFAULT}`
        )
      })

      it('should not cache the failed lookup', async () => {
        await component.getPermissions(WORLD_NAMES.DEFAULT).catch(() => undefined)

        expect(cache.set).not.toHaveBeenCalled()
      })
    })

    describe('and the deployment is an allow-list without a wallets array', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ owner: ADDRESSES.OWNER, permissions: { deployment: { type: 'allow-list' } } })
        })
        component = await createComponent()
      })

      it('should throw an error instead of treating it as an empty allow-list', async () => {
        await expect(component.getPermissions(WORLD_NAMES.DEFAULT)).rejects.toThrow(
          `Worlds content server returned an unexpected permissions payload for ${WORLD_NAMES.DEFAULT}`
        )
      })
    })
  })

  describe('when getting world scenes', () => {
    function buildSceneItem(
      overrides: {
        sceneId?: string
        base?: string
        parcels?: string[]
        title?: string
        logsPermissions?: unknown
      } = {}
    ): unknown {
      return {
        entity: {
          id: overrides.sceneId ?? 'scene-entity-id',
          metadata: {
            display: overrides.title === undefined ? undefined : { title: overrides.title },
            scene: {
              base: overrides.base ?? PARCELS.DEFAULT,
              parcels: overrides.parcels ?? [PARCELS.DEFAULT]
            },
            logsPermissions: overrides.logsPermissions ?? [ADDRESSES.AUTHORIZED]
          }
        }
      }
    }

    describe('and the fetch is successful', () => {
      let component: IWorldsContentServerComponent
      let sceneItem: unknown

      beforeEach(async () => {
        sceneItem = buildSceneItem({ title: 'My Scene' })
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ scenes: [sceneItem] })
        })
        component = await createComponent()
      })

      it('should map the scenes and extract logsPermissions', async () => {
        const result = await component.getScenes(WORLD_NAMES.DEFAULT)

        const expected: WorldScene = {
          sceneId: 'scene-entity-id',
          base: PARCELS.DEFAULT,
          parcels: [PARCELS.DEFAULT],
          title: 'My Scene',
          deployedAt: 0,
          logsPermissions: [ADDRESSES.AUTHORIZED.toLowerCase()]
        }
        expect(result).toEqual([expected])
      })

      it('should call the content server scenes endpoint', async () => {
        await component.getScenes(WORLD_NAMES.DEFAULT)

        expect(fetchMock).toHaveBeenCalledWith(
          `${WORLDS_CONTENT_SERVER_URL}/world/${encodeURIComponent(WORLD_NAMES.DEFAULT)}/scenes`,
          FETCH_OPTIONS
        )
      })

      it('should cache the scenes under world-scenes:<world>', async () => {
        const result = await component.getScenes(WORLD_NAMES.DEFAULT)

        expect(cache.set).toHaveBeenCalledWith(`world-scenes:${WORLD_NAMES.DEFAULT}`, result, 30)
      })
    })

    describe('and a scene has no display title', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ scenes: [buildSceneItem()] })
        })
        component = await createComponent()
      })

      it('should default the title to null', async () => {
        const [scene] = await component.getScenes(WORLD_NAMES.DEFAULT)

        expect(scene.title).toBeNull()
      })
    })

    describe('and a scene entity document omits its own id', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              scenes: [
                {
                  entityId: 'item-level-entity-id',
                  entity: {
                    metadata: {
                      display: { title: 'Idless Scene' },
                      scene: { base: PARCELS.DEFAULT, parcels: [PARCELS.DEFAULT] },
                      logsPermissions: [ADDRESSES.AUTHORIZED]
                    }
                  }
                }
              ]
            })
        })
        component = await createComponent()
      })

      it('should map the scene using the item-level entityId as the scene id', async () => {
        const [scene] = await component.getScenes(WORLD_NAMES.DEFAULT)

        expect(scene).toEqual({
          sceneId: 'item-level-entity-id',
          base: PARCELS.DEFAULT,
          parcels: [PARCELS.DEFAULT],
          title: 'Idless Scene',
          deployedAt: 0,
          logsPermissions: [ADDRESSES.AUTHORIZED.toLowerCase()]
        })
      })
    })

    describe('and the scenes are already cached', () => {
      let component: IWorldsContentServerComponent
      let cachedScenes: WorldScene[]

      beforeEach(async () => {
        cachedScenes = [
          {
            sceneId: 'cached-scene',
            base: PARCELS.DEFAULT,
            parcels: [PARCELS.DEFAULT],
            title: null,
            deployedAt: 0,
            logsPermissions: []
          }
        ]
        cache.get.mockResolvedValueOnce(cachedScenes)
        component = await createComponent()
      })

      it('should return the cached scenes without fetching', async () => {
        const result = await component.getScenes(WORLD_NAMES.DEFAULT)

        expect(result).toEqual(cachedScenes)
        expect(fetchMock).not.toHaveBeenCalled()
      })
    })

    describe('and the payload is missing the scenes array', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({})
        })
        component = await createComponent()
      })

      it('should throw an error indicating an unexpected payload', async () => {
        await expect(component.getScenes(WORLD_NAMES.DEFAULT)).rejects.toThrow(
          `Worlds content server returned an unexpected scenes payload for ${WORLD_NAMES.DEFAULT}`
        )
      })
    })

    describe('and one scene item is malformed among valid ones', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              scenes: [
                { entity: { id: 'bad', metadata: {} } },
                {
                  entity: {
                    id: 'good',
                    metadata: {
                      scene: { base: '1,2', parcels: ['1,2'] },
                      display: { title: 'Good' },
                      logsPermissions: []
                    }
                  }
                }
              ]
            })
        })
        component = await createComponent()
      })

      it('should skip the malformed scene and return the valid one', async () => {
        await expect(component.getScenes(WORLD_NAMES.DEFAULT)).resolves.toEqual([
          { sceneId: 'good', base: '1,2', parcels: ['1,2'], title: 'Good', deployedAt: 0, logsPermissions: [] }
        ])
      })
    })

    describe('and the fetch fails', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 404
        })
        component = await createComponent()
      })

      it('should throw an error with the world name', async () => {
        await expect(component.getScenes(WORLD_NAMES.DEFAULT)).rejects.toThrow(
          `Failed to fetch world scenes for ${WORLD_NAMES.DEFAULT}`
        )
      })
    })

    describe('and the fetch throws a network error', () => {
      let component: IWorldsContentServerComponent

      beforeEach(async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network error'))
        component = await createComponent()
      })

      it('should throw an error indicating network error', async () => {
        await expect(component.getScenes(WORLD_NAMES.DEFAULT)).rejects.toThrow(
          `Failed to fetch world scenes for ${WORLD_NAMES.DEFAULT}: network error`
        )
      })
    })
  })
})
