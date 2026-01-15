import { createWorldsContentServerComponent } from '../../../src/adapters/worlds-content-server'
import { ADDRESSES, WORLD_NAMES } from '../../fixtures'
import type { IWorldsContentServerComponent, WorldPermissions } from '../../../src/adapters/worlds-content-server'
import type { AppComponents } from '../../../src/types'

describe('Worlds Content Server Component', () => {
  const WORLDS_CONTENT_SERVER_URL = 'https://worlds-content-server.decentraland.org'

  let fetchMock: jest.Mock
  let configRequireString: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    configRequireString = jest.fn().mockResolvedValue(WORLDS_CONTENT_SERVER_URL)
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
      config: { requireString: configRequireString }
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
          `${WORLDS_CONTENT_SERVER_URL}/world/${encodeURIComponent(specialWorldName)}/permissions`
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

      it('should propagate the error', async () => {
        await expect(component.getPermissions(WORLD_NAMES.DEFAULT)).rejects.toThrow('Network error')
      })
    })
  })
})
