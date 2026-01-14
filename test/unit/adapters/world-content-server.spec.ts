import { createWorldContentServerComponent } from '../../../src/adapters/world-content-server'
import { ADDRESSES, WORLD_NAMES } from '../../fixtures'
import type { IWorldContentServerComponent, WorldPermissions } from '../../../src/adapters/world-content-server'
import type { AppComponents } from '../../../src/types'

describe('createWorldContentServerComponent', () => {
  const WORLD_CONTENT_SERVER_URL = 'https://worlds-content-server.decentraland.org'

  let fetchMock: jest.Mock
  let configRequireString: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    configRequireString = jest.fn().mockResolvedValue(WORLD_CONTENT_SERVER_URL)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function buildMockPermissions(): WorldPermissions {
    return {
      owner: ADDRESSES.OWNER,
      permissions: {
        deployment: { type: 'allow-list', wallets: [ADDRESSES.UNAUTHORIZED] },
        access: { type: 'allow-list', wallets: [ADDRESSES.AUTHORIZED] },
        streaming: { type: 'allow-list', wallets: [ADDRESSES.ANOTHER_AUTHORIZED] }
      }
    }
  }

  async function createComponent(): Promise<IWorldContentServerComponent> {
    return createWorldContentServerComponent({
      fetcher: { fetch: fetchMock },
      config: { requireString: configRequireString }
    } as unknown as AppComponents)
  }

  describe('getPermissions', () => {
    describe('when the fetch is successful', () => {
      let component: IWorldContentServerComponent
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

    describe('when the world name contains special characters', () => {
      let component: IWorldContentServerComponent
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
          `${WORLD_CONTENT_SERVER_URL}/world/${encodeURIComponent(specialWorldName)}/permissions`
        )
      })
    })

    describe('when the fetch fails', () => {
      let component: IWorldContentServerComponent

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

    describe('when the fetch throws a network error', () => {
      let component: IWorldContentServerComponent

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
