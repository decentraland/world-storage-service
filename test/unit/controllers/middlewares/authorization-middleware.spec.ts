import { NotAuthorizedError } from '@dcl/platform-server-commons'
import {
  authorizationMiddleware,
  createAuthorizationMiddleware
} from '../../../../src/controllers/middlewares/authorization-middleware'
import { ADDRESSES, WORLD_NAMES } from '../../../fixtures'
import { buildTestContext } from '../../utils/context'
import type { WorldPermissions } from '../../../../src/adapters/worlds-content-server/types'
import type { BaseComponents } from '../../../../src/types'
import type { TestContext } from '../../utils/context'

describe('authorizationMiddleware', () => {
  const next = jest.fn()
  let configGetString: jest.Mock
  let getPermissionsMock: jest.Mock
  let warn: jest.Mock

  beforeEach(() => {
    configGetString = jest.fn()
    getPermissionsMock = jest.fn()
    warn = jest.fn()
    next.mockReset()
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

  function buildCtx(auth?: string, worldName?: string): TestContext {
    return buildTestContext({
      worldName: worldName ?? WORLD_NAMES.DEFAULT,
      verification: { auth: auth ?? '', authMetadata: {} },
      components: {
        config: { getString: configGetString },
        logs: { getLogger: () => ({ warn }) },
        worldsContentServer: { getPermissions: getPermissionsMock }
      } as unknown as BaseComponents
    })
  }

  describe('when the signer address is missing', () => {
    it('should throw a NotAuthorizedError', async () => {
      await expect(authorizationMiddleware(buildCtx(undefined), next)).rejects.toThrow(
        new NotAuthorizedError('Unauthorized: No signer address found')
      )
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when the world permissions fetch fails', () => {
    beforeEach(() => {
      getPermissionsMock.mockRejectedValueOnce(new Error('Failed to fetch world permissions'))
    })

    it('should throw a NotAuthorizedError', async () => {
      await expect(authorizationMiddleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
        new NotAuthorizedError('Unauthorized: Failed to verify world permissions')
      )
      expect(next).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalled()
    })
  })

  describe('when the signer is the world owner', () => {
    beforeEach(() => {
      getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
      next.mockResolvedValueOnce({ status: 200 })
    })

    it('should allow the request', async () => {
      const result = await authorizationMiddleware(buildCtx(ADDRESSES.OWNER), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the signer is the world owner with different case', () => {
    beforeEach(() => {
      getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions({ owner: ADDRESSES.OWNER.toUpperCase() }))
      next.mockResolvedValueOnce({ status: 200 })
    })

    it('should allow the request (case-insensitive)', async () => {
      const result = await authorizationMiddleware(buildCtx(ADDRESSES.OWNER), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the signer has deployer permissions', () => {
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
      next.mockResolvedValueOnce({ status: 200 })
    })

    it('should allow the request', async () => {
      const result = await authorizationMiddleware(buildCtx(ADDRESSES.DEPLOYER), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the signer has deployer permissions with different case', () => {
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
      next.mockResolvedValueOnce({ status: 200 })
    })

    it('should allow the request (case-insensitive)', async () => {
      const result = await authorizationMiddleware(buildCtx(ADDRESSES.DEPLOYER), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the signer is not the owner and has no deployer permissions', () => {
    describe('and allowAuthorizedAddresses is false (default)', () => {
      beforeEach(() => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
      })

      it('should throw a NotAuthorizedError', async () => {
        await expect(authorizationMiddleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
          new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
        )
        expect(next).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalled()
      })
    })

    describe('and allowAuthorizedAddresses is true', () => {
      let middleware: ReturnType<typeof createAuthorizationMiddleware>

      beforeEach(() => {
        middleware = createAuthorizationMiddleware({ allowAuthorizedAddresses: true })
      })

      describe('and the signer matches the authoritative server address', () => {
        beforeEach(() => {
          getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
          configGetString.mockImplementation((key: string) => {
            if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
              return Promise.resolve(ADDRESSES.AUTHORITATIVE)
            }
            return Promise.resolve(undefined)
          })
          next.mockResolvedValueOnce({ status: 200 })
        })

        it('should allow the request', async () => {
          const result = await middleware(buildCtx(ADDRESSES.AUTHORITATIVE), next)

          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200 })
        })
      })

      describe('and the signer is in the authorized addresses list', () => {
        beforeEach(() => {
          getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
          configGetString.mockImplementation((key: string) => {
            if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
              return Promise.resolve(undefined)
            }
            if (key === 'AUTHORIZED_ADDRESSES') {
              return Promise.resolve(`${ADDRESSES.AUTHORIZED}, ${ADDRESSES.ANOTHER_AUTHORIZED}`)
            }
            return Promise.resolve(undefined)
          })
          next.mockResolvedValueOnce({ status: 200 })
        })

        it('should allow the request', async () => {
          const result = await middleware(buildCtx(ADDRESSES.AUTHORIZED), next)

          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200 })
        })
      })

      describe('and the signer is not in any allowed addresses', () => {
        beforeEach(() => {
          getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
          configGetString.mockImplementation((key: string) => {
            if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
              return Promise.resolve(ADDRESSES.OTHER)
            }
            if (key === 'AUTHORIZED_ADDRESSES') {
              return Promise.resolve(`${ADDRESSES.ANOTHER_AUTHORIZED}, 0xghi`)
            }
            return Promise.resolve(undefined)
          })
        })

        it('should throw a NotAuthorizedError', async () => {
          await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
            new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
          )
          expect(next).not.toHaveBeenCalled()
          expect(warn).toHaveBeenCalled()
        })
      })

      describe('and both authoritative and authorized addresses configs are empty', () => {
        beforeEach(() => {
          getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
          configGetString.mockResolvedValue(undefined)
        })

        it('should throw a NotAuthorizedError', async () => {
          await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
            new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
          )
          expect(next).not.toHaveBeenCalled()
          expect(warn).toHaveBeenCalled()
        })
      })
    })
  })
})
