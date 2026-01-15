import { createWorldPermissionComponent } from '../../../src/logic/world-permission'
import { ADDRESSES, WORLD_NAMES } from '../../fixtures'
import type { IWorldsContentServerComponent, WorldPermissions } from '../../../src/adapters/worlds-content-server'
import type { IWorldPermissionComponent } from '../../../src/logic/world-permission'

describe('World Permission Component', () => {
  let getPermissionsMock: jest.Mock
  let worldsContentServerMock: IWorldsContentServerComponent

  beforeEach(() => {
    getPermissionsMock = jest.fn()
    worldsContentServerMock = {
      getPermissions: getPermissionsMock
    }
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

  function createComponent(): IWorldPermissionComponent {
    return createWorldPermissionComponent({ worldsContentServer: worldsContentServerMock })
  }

  describe('when calling hasWorldPermission', () => {
    describe('and the address is the world owner', () => {
      let component: IWorldPermissionComponent

      beforeEach(() => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
        component = createComponent()
      })

      it('should return true', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.OWNER)

        expect(result).toBe(true)
      })
    })

    describe('and the address is the world owner with different case', () => {
      let component: IWorldPermissionComponent

      beforeEach(() => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions({ owner: ADDRESSES.OWNER.toUpperCase() }))
        component = createComponent()
      })

      it('should return true (case-insensitive)', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.OWNER)

        expect(result).toBe(true)
      })
    })

    describe('and the address has deployer permissions', () => {
      let component: IWorldPermissionComponent

      beforeEach(() => {
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
        component = createComponent()
      })

      it('should return true', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.DEPLOYER)

        expect(result).toBe(true)
      })
    })

    describe('and the address has deployer permissions with different case', () => {
      let component: IWorldPermissionComponent

      beforeEach(() => {
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
        component = createComponent()
      })

      it('should return true (case-insensitive)', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.DEPLOYER)

        expect(result).toBe(true)
      })
    })

    describe('and the address is neither owner nor deployer', () => {
      let component: IWorldPermissionComponent

      beforeEach(() => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
        component = createComponent()
      })

      it('should return false', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.UNAUTHORIZED)

        expect(result).toBe(false)
      })
    })

    describe('and the deployment type is not allow-list', () => {
      let component: IWorldPermissionComponent

      beforeEach(() => {
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
        component = createComponent()
      })

      it('should return false for non-owner addresses', async () => {
        const result = await component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.DEPLOYER)

        expect(result).toBe(false)
      })
    })

    describe('and the fetch fails', () => {
      let component: IWorldPermissionComponent

      beforeEach(() => {
        getPermissionsMock.mockRejectedValueOnce(new Error('Network error'))
        component = createComponent()
      })

      it('should propagate the error', async () => {
        await expect(component.hasWorldPermission(WORLD_NAMES.DEFAULT, ADDRESSES.OWNER)).rejects.toThrow(
          'Network error'
        )
      })
    })
  })
})
