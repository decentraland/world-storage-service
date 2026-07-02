import type { IConfigComponent } from '@well-known-components/interfaces'
import type { IFetchComponent } from '@dcl/core-commons'
import { createConfigMockedComponent, createFetchMockedComponent } from '@dcl/core-commons'
import { createWorldPermissionComponent } from '../../../src/logic/world-permission'
import { ADDRESSES, PARCELS, WORLD_NAMES } from '../../fixtures'
import { createLogsMockedComponent } from '../../mocks/components'
import type { IWorldsContentServerComponent, WorldPermissions } from '../../../src/adapters/worlds-content-server'
import type { IWorldPermissionComponent } from '../../../src/logic/world-permission'

describe('World Permission Component', () => {
  let getPermissionsMock: jest.Mock
  let worldsContentServerMock: IWorldsContentServerComponent
  let fetcher: jest.Mocked<IFetchComponent>
  let config: jest.Mocked<IConfigComponent>

  beforeEach(async () => {
    getPermissionsMock = jest.fn()
    worldsContentServerMock = {
      getPermissions: getPermissionsMock
    }
    fetcher = createFetchMockedComponent() as jest.Mocked<IFetchComponent>
    config = createConfigMockedComponent() as jest.Mocked<IConfigComponent>
    // LAMBDAS_URL is required at component init since the factory reads it at startup
    config.requireString.mockResolvedValue('https://peer.decentraland.org/lambdas')
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function buildWorldPermissions(overrides: Partial<WorldPermissions> = {}): WorldPermissions {
    return {
      permissions: {
        deployment: {
          type: 'allow-list',
          wallets: []
        }
      },
      owner: ADDRESSES.OWNER,
      ...overrides
    }
  }

  function mockResponse(response: Partial<Response>): Response {
    return response as Response
  }

  function createComponent(): Promise<IWorldPermissionComponent> {
    return createWorldPermissionComponent({
      worldsContentServer: worldsContentServerMock,
      fetcher,
      config,
      logs: createLogsMockedComponent()
    })
  }

  describe('when calling hasWorldPermission', () => {
    describe('and the address is the world owner', () => {
      let component: IWorldPermissionComponent

      beforeEach(async () => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
        component = await createComponent()
      })

      it('should return true', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.OWNER, PARCELS.DEFAULT)

        expect(result).toBe(true)
      })
    })

    describe('and the address is the world owner with different case', () => {
      let component: IWorldPermissionComponent

      beforeEach(async () => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions({ owner: ADDRESSES.OWNER.toUpperCase() }))
        component = await createComponent()
      })

      it('should return true (case-insensitive)', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.OWNER, PARCELS.DEFAULT)

        expect(result).toBe(true)
      })
    })

    describe('and the address has deployer permissions', () => {
      let component: IWorldPermissionComponent

      beforeEach(async () => {
        getPermissionsMock.mockResolvedValueOnce(
          buildWorldPermissions({
            permissions: {
              deployment: {
                type: 'allow-list',
                wallets: [ADDRESSES.DEPLOYER]
              }
            }
          })
        )
        component = await createComponent()
      })

      it('should return true', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.DEPLOYER, PARCELS.DEFAULT)

        expect(result).toBe(true)
      })
    })

    describe('and the address has deployer permissions with different case', () => {
      let component: IWorldPermissionComponent

      beforeEach(async () => {
        getPermissionsMock.mockResolvedValueOnce(
          buildWorldPermissions({
            permissions: {
              deployment: {
                type: 'allow-list',
                wallets: [ADDRESSES.DEPLOYER.toUpperCase()]
              }
            }
          })
        )
        component = await createComponent()
      })

      it('should return true (case-insensitive)', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.DEPLOYER, PARCELS.DEFAULT)

        expect(result).toBe(true)
      })
    })

    describe('and the address is neither owner nor deployer', () => {
      let component: IWorldPermissionComponent

      beforeEach(async () => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
        component = await createComponent()
      })

      it('should return false', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.UNAUTHORIZED, PARCELS.DEFAULT)

        expect(result).toBe(false)
      })
    })

    describe('and the deployment type is not allow-list', () => {
      let component: IWorldPermissionComponent

      beforeEach(async () => {
        getPermissionsMock.mockResolvedValueOnce(
          buildWorldPermissions({
            permissions: {
              deployment: {
                type: 'unrestricted',
                wallets: [ADDRESSES.DEPLOYER]
              }
            }
          })
        )
        component = await createComponent()
      })

      it('should return false for non-owner addresses', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.DEPLOYER, PARCELS.DEFAULT)

        expect(result).toBe(false)
      })
    })

    describe('and the fetch fails', () => {
      let component: IWorldPermissionComponent

      beforeEach(async () => {
        getPermissionsMock.mockRejectedValueOnce(new Error('Network error'))
        component = await createComponent()
      })

      it('should propagate the error', async () => {
        await expect(
          component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.OWNER, PARCELS.DEFAULT)
        ).rejects.toThrow('Network error')
      })
    })

    describe('and the worldName is main (Genesis City)', () => {
      const LAMBDAS_URL = 'https://peer.decentraland.org/lambdas'

      beforeEach(async () => {
        config.requireString.mockResolvedValue(LAMBDAS_URL)
      })

      it('should call the LAMBDAS API for permission checks', async () => {
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: async () => ({
              owner: true,
              operator: false,
              updateOperator: false,
              updateManager: false,
              approvedForAll: false
            })
          })
        )

        const component = await createComponent()
        await component.hasWorldPermission('main', ADDRESSES.OWNER, PARCELS.GENESIS_CITY)

        expect(fetcher.fetch).toHaveBeenCalledWith(
          `${LAMBDAS_URL}/users/${ADDRESSES.OWNER}/parcels/52/-10/permissions`,
          {
            timeout: 5000,
            attempts: 3,
            retryDelay: 200
          }
        )
        expect(getPermissionsMock).not.toHaveBeenCalled()
      })

      describe('and LAMBDAS returns owner:true', () => {
        beforeEach(async () => {
          fetcher.fetch.mockResolvedValueOnce(
            mockResponse({
              ok: true,
              json: async () => ({
                owner: true,
                operator: false,
                updateOperator: false,
                updateManager: false,
                approvedForAll: false
              })
            })
          )
        })

        it('should return true', async () => {
          const component = await createComponent()
          const result = await component.hasWorldPermission('main', ADDRESSES.OWNER, PARCELS.GENESIS_CITY)

          expect(result).toBe(true)
        })
      })

      describe('and LAMBDAS returns operator:true', () => {
        beforeEach(async () => {
          fetcher.fetch.mockResolvedValueOnce(
            mockResponse({
              ok: true,
              json: async () => ({
                owner: false,
                operator: true,
                updateOperator: false,
                updateManager: false,
                approvedForAll: false
              })
            })
          )
        })

        it('should return true', async () => {
          const component = await createComponent()
          const result = await component.hasWorldPermission('main', ADDRESSES.OWNER, PARCELS.GENESIS_CITY)

          expect(result).toBe(true)
        })
      })

      describe('and LAMBDAS returns all false', () => {
        beforeEach(async () => {
          fetcher.fetch.mockResolvedValueOnce(
            mockResponse({
              ok: true,
              json: async () => ({
                owner: false,
                operator: false,
                updateOperator: false,
                updateManager: false,
                approvedForAll: false
              })
            })
          )
        })

        it('should return false', async () => {
          const component = await createComponent()
          const result = await component.hasWorldPermission('main', ADDRESSES.OWNER, PARCELS.GENESIS_CITY)

          expect(result).toBe(false)
        })
      })

      describe('and LAMBDAS returns a non-ok response', () => {
        beforeEach(async () => {
          fetcher.fetch.mockResolvedValueOnce(
            mockResponse({
              ok: false,
              status: 403
            })
          )
        })

        it('should return false', async () => {
          const component = await createComponent()
          const result = await component.hasWorldPermission('main', ADDRESSES.OWNER, PARCELS.GENESIS_CITY)

          expect(result).toBe(false)
        })
      })

      describe('and the LAMBDAS fetch fails', () => {
        beforeEach(async () => {
          fetcher.fetch.mockRejectedValueOnce(new Error('LAMBDAS network error'))
        })

        it('should propagate the error', async () => {
          const component = await createComponent()

          await expect(component.hasWorldPermission('main', ADDRESSES.OWNER, PARCELS.GENESIS_CITY)).rejects.toThrow(
            'LAMBDAS network error'
          )
        })
      })
    })
  })
})
