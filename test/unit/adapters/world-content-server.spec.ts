import { createWorldContentServerComponent } from '../../../src/adapters/world-content-server'
import type { IWorldContentServerComponent, WorldPermissions } from '../../../src/adapters/world-content-server'
import type { AppComponents } from '../../../src/types'

describe('createWorldContentServerComponent', () => {
  const WORLD_CONTENT_SERVER_URL = 'https://worlds-content-server.decentraland.org'
  const WORLD_NAME = 'test-world.dcl.eth'

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
      owner: '0x51a514d3f28ea19775e811fc09396e808394bd12',
      permissions: {
        deployment: { type: 'allow-list', wallets: ['0x123'] },
        access: { type: 'allow-list', wallets: ['0x456'] },
        streaming: { type: 'allow-list', wallets: ['0x789'] }
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
        const result = await component.getPermissions(WORLD_NAME)

        expect(result).toEqual(mockPermissions)
      })
    })

    describe('when the world name contains special characters', () => {
      let component: IWorldContentServerComponent
      const specialWorldName = 'test world/name'

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
        await expect(component.getPermissions(WORLD_NAME)).rejects.toThrow(
          `Failed to fetch world permissions for ${WORLD_NAME}`
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
        await expect(component.getPermissions(WORLD_NAME)).rejects.toThrow('Network error')
      })
    })
  })
})
