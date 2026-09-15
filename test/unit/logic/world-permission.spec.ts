import type { IConfigComponent } from '@well-known-components/interfaces'
import type { IFetchComponent } from '@dcl/core-commons'
import { createConfigMockedComponent, createFetchMockedComponent } from '@dcl/core-commons'
import { createWorldPermissionComponent } from '../../../src/logic/world-permission'
import { ADDRESSES, PARCELS, WORLD_NAMES } from '../../fixtures'
import { createCatalystContentMockedComponent, createLogsMockedComponent } from '../../mocks/components'
import type { ICatalystContentComponent } from '../../../src/adapters/catalyst-content'
import type {
  IWorldsContentServerComponent,
  WorldPermissions,
  WorldScene
} from '../../../src/adapters/worlds-content-server'
import type { IWorldPermissionComponent } from '../../../src/logic/world-permission'

describe('World Permission Component', () => {
  let getPermissionsMock: jest.Mock
  let getScenesMock: jest.Mock
  let worldsContentServerMock: IWorldsContentServerComponent
  let catalystContent: jest.Mocked<ICatalystContentComponent>
  let fetcher: jest.Mocked<IFetchComponent>
  let config: jest.Mocked<IConfigComponent>

  beforeEach(async () => {
    getPermissionsMock = jest.fn()
    getScenesMock = jest.fn()
    worldsContentServerMock = {
      getPermissions: getPermissionsMock,
      getScenes: getScenesMock
    }
    catalystContent = createCatalystContentMockedComponent()
    fetcher = createFetchMockedComponent() as jest.Mocked<IFetchComponent>
    config = createConfigMockedComponent() as jest.Mocked<IConfigComponent>
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
      catalystContent,
      fetcher,
      config,
      logs: createLogsMockedComponent()
    })
  }

  function buildWorldScene(overrides: Partial<WorldScene> = {}): WorldScene {
    return {
      sceneId: 'scene-id',
      base: PARCELS.DEFAULT,
      parcels: [PARCELS.DEFAULT],
      title: 'Test scene',
      deployedAt: 0,
      logsPermissions: [],
      ...overrides
    }
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

    describe('and the worldName is an ENS world', () => {
      let component: IWorldPermissionComponent
      let result: boolean

      beforeEach(async () => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
        component = await createComponent()
        result = await component.hasWorldPermission(WORLD_NAMES.ENS, ADDRESSES.OWNER, PARCELS.DEFAULT)
      })

      it('should resolve permissions from the content server for the ENS name', () => {
        expect(getPermissionsMock).toHaveBeenCalledWith(WORLD_NAMES.ENS)
      })

      it('should not fall back to a LAND permission check at the base parcel', () => {
        expect(fetcher.fetch).not.toHaveBeenCalled()
      })

      it('should return true for the world owner', () => {
        expect(result).toBe(true)
      })
    })

    describe('and the worldName is an ENS world and the address holds no world permission', () => {
      let component: IWorldPermissionComponent
      let result: boolean

      beforeEach(async () => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
        // LAMBDAS is primed to grant, so a fallback to the Genesis City path would flip this to true
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
        component = await createComponent()
        result = await component.hasWorldPermission(WORLD_NAMES.ENS, ADDRESSES.OTHER, PARCELS.DEFAULT)
      })

      it('should return false even though LAND ownership at the base parcel would grant', () => {
        expect(result).toBe(false)
      })

      it('should not consult the LAND permission check', () => {
        expect(fetcher.fetch).not.toHaveBeenCalled()
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

  describe('when calling getLogsAccessibleScene', () => {
    describe('and the worldName is a world', () => {
      describe('and one scene covers the parcel and lists the address in logsPermissions', () => {
        let component: IWorldPermissionComponent
        let scene: WorldScene
        let result: WorldScene | null

        beforeEach(async () => {
          scene = buildWorldScene({ logsPermissions: [ADDRESSES.PLAYER.toLowerCase()] })
          getScenesMock.mockResolvedValueOnce([scene])
          component = await createComponent()
          result = await component.getLogsAccessibleScene(WORLD_NAMES.DEFAULT, ADDRESSES.PLAYER, PARCELS.DEFAULT)
        })

        it('should return the matched scene', () => {
          expect(result).toBe(scene)
        })
      })

      describe('and the address is absent from logsPermissions', () => {
        let component: IWorldPermissionComponent
        let result: WorldScene | null

        beforeEach(async () => {
          getScenesMock.mockResolvedValueOnce([buildWorldScene({ logsPermissions: [ADDRESSES.OWNER] })])
          component = await createComponent()
          result = await component.getLogsAccessibleScene(WORLD_NAMES.DEFAULT, ADDRESSES.PLAYER, PARCELS.DEFAULT)
        })

        it('should return null', () => {
          expect(result).toBeNull()
        })
      })

      describe('and the metadata address casing differs from the lowercased signer', () => {
        let component: IWorldPermissionComponent
        let scene: WorldScene
        let result: WorldScene | null

        beforeEach(async () => {
          scene = buildWorldScene({ logsPermissions: [ADDRESSES.PLAYER.toLowerCase()] })
          getScenesMock.mockResolvedValueOnce([scene])
          component = await createComponent()
          result = await component.getLogsAccessibleScene(
            WORLD_NAMES.DEFAULT,
            ADDRESSES.PLAYER.toUpperCase(),
            PARCELS.DEFAULT
          )
        })

        it('should return the matched scene (case-insensitive)', () => {
          expect(result).toBe(scene)
        })
      })

      describe('and zero scenes cover the parcel', () => {
        let component: IWorldPermissionComponent
        let result: WorldScene | null

        beforeEach(async () => {
          getScenesMock.mockResolvedValueOnce([buildWorldScene({ base: PARCELS.SCENE_A, parcels: [PARCELS.SCENE_A] })])
          component = await createComponent()
          result = await component.getLogsAccessibleScene(WORLD_NAMES.DEFAULT, ADDRESSES.PLAYER, PARCELS.DEFAULT)
        })

        it('should return null', () => {
          expect(result).toBeNull()
        })
      })

      describe('and two scenes cover the parcel (ambiguous match)', () => {
        let component: IWorldPermissionComponent
        let result: WorldScene | null

        beforeEach(async () => {
          getScenesMock.mockResolvedValueOnce([
            buildWorldScene({ sceneId: 'scene-a', logsPermissions: [ADDRESSES.PLAYER] }),
            buildWorldScene({ sceneId: 'scene-b', logsPermissions: [ADDRESSES.PLAYER] })
          ])
          component = await createComponent()
          result = await component.getLogsAccessibleScene(WORLD_NAMES.DEFAULT, ADDRESSES.PLAYER, PARCELS.DEFAULT)
        })

        it('should return null', () => {
          expect(result).toBeNull()
        })
      })
    })

    describe('and the worldName is main (Genesis City)', () => {
      describe('and the active scene entity lists the address in logsPermissions', () => {
        let component: IWorldPermissionComponent
        let scene: WorldScene
        let result: WorldScene | null

        beforeEach(async () => {
          scene = buildWorldScene({ base: PARCELS.GENESIS_CITY, logsPermissions: [ADDRESSES.PLAYER.toLowerCase()] })
          catalystContent.getActiveSceneEntity.mockResolvedValueOnce(scene)
          component = await createComponent()
          result = await component.getLogsAccessibleScene('main', ADDRESSES.PLAYER, PARCELS.GENESIS_CITY)
        })

        it('should return the matched scene', () => {
          expect(result).toBe(scene)
        })
      })

      describe('and getActiveSceneEntity returns null', () => {
        let component: IWorldPermissionComponent
        let result: WorldScene | null

        beforeEach(async () => {
          catalystContent.getActiveSceneEntity.mockResolvedValueOnce(null)
          component = await createComponent()
          result = await component.getLogsAccessibleScene('main', ADDRESSES.PLAYER, PARCELS.GENESIS_CITY)
        })

        it('should return null', () => {
          expect(result).toBeNull()
        })
      })
    })

    describe('and the upstream throws', () => {
      let component: IWorldPermissionComponent
      let result: WorldScene | null

      beforeEach(async () => {
        getScenesMock.mockRejectedValueOnce(new Error('Network error'))
        component = await createComponent()
        result = await component.getLogsAccessibleScene(WORLD_NAMES.DEFAULT, ADDRESSES.PLAYER, PARCELS.DEFAULT)
      })

      it('should return null (fail closed)', () => {
        expect(result).toBeNull()
      })
    })
  })
})
