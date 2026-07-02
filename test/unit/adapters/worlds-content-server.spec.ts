import type { ICacheStorageComponent } from '@dcl/core-commons'
import { createWorldsContentServerComponent } from '../../../src/adapters/worlds-content-server'
import { ADDRESSES, WORLD_NAMES } from '../../fixtures'
import { createCacheMockedComponent, createLogsMockedComponent } from '../../mocks/components'
import type { IWorldsContentServerComponent, WorldPermissions } from '../../../src/adapters/worlds-content-server'
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
})
