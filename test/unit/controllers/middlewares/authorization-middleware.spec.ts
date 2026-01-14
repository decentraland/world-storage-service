import {
  authorizationMiddleware,
  createAuthorizationMiddleware
} from '../../../../src/controllers/middlewares/authorization-middleware'
import { buildTestContext } from '../../utils/context'
import type { WorldPermissions } from '../../../../src/adapters/world-content-server/types'
import type { BaseComponents } from '../../../../src/types'
import type { TestContext } from '../../utils/context'

describe('authorizationMiddleware', () => {
  const WORLD_NAME = 'test-world.dcl.eth'
  const OWNER_ADDRESS = '0x51a514d3f28ea19775e811fc09396e808394bd12'
  const DEPLOYER_ADDRESS = '0x6a327965be29a7acb83e1d1bbd689b72e188e58d'
  const AUTHORITATIVE_ADDRESS = '0xabc'
  const AUTHORIZED_ADDRESS = '0x456'
  const UNAUTHORIZED_ADDRESS = '0x123'

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
        },
        access: {
          type: 'allow-list',
          wallets: []
        },
        streaming: {
          type: 'allow-list',
          wallets: []
        }
      },
      owner: OWNER_ADDRESS,
      ...overrides
    }
  }

  function buildCtx(auth?: string, worldName?: string): TestContext {
    return buildTestContext({
      worldName: worldName ?? WORLD_NAME,
      verification: { auth: auth ?? '', authMetadata: {} },
      components: {
        config: { getString: configGetString },
        logs: { getLogger: () => ({ warn }) },
        worldContentServer: { getPermissions: getPermissionsMock }
      } as unknown as BaseComponents
    })
  }

  describe('when the signer address is missing', () => {
    it('should respond with 401 and the appropriate error message', async () => {
      const result = await authorizationMiddleware(buildCtx(undefined), next)

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { message: 'Unauthorized: No signer address found' }
      })
    })
  })

  describe('when the world name is missing', () => {
    let ctx: TestContext

    beforeEach(() => {
      ctx = buildCtx(UNAUTHORIZED_ADDRESS, undefined)
      ctx.worldName = undefined
    })

    it('should respond with 401 and the appropriate error message', async () => {
      const result = await authorizationMiddleware(ctx, next)

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { message: 'Unauthorized: No world name found' }
      })
    })
  })

  describe('when the world permissions fetch fails', () => {
    beforeEach(() => {
      getPermissionsMock.mockRejectedValueOnce(new Error('Failed to fetch world permissions'))
    })

    it('should respond with 401 and the appropriate error message', async () => {
      const result = await authorizationMiddleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { message: 'Unauthorized: Failed to verify world permissions' }
      })
      expect(warn).toHaveBeenCalled()
    })
  })

  describe('when the signer is the world owner', () => {
    beforeEach(() => {
      getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
      next.mockResolvedValueOnce({ status: 200 })
    })

    it('should allow the request', async () => {
      const result = await authorizationMiddleware(buildCtx(OWNER_ADDRESS), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the signer is the world owner with different case', () => {
    beforeEach(() => {
      getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions({ owner: OWNER_ADDRESS.toUpperCase() }))
      next.mockResolvedValueOnce({ status: 200 })
    })

    it('should allow the request (case-insensitive)', async () => {
      const result = await authorizationMiddleware(buildCtx(OWNER_ADDRESS), next)

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
              wallets: [DEPLOYER_ADDRESS]
            },
            access: { type: 'allow-list', wallets: [] },
            streaming: { type: 'allow-list', wallets: [] }
          }
        })
      )
      next.mockResolvedValueOnce({ status: 200 })
    })

    it('should allow the request', async () => {
      const result = await authorizationMiddleware(buildCtx(DEPLOYER_ADDRESS), next)

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
              wallets: [DEPLOYER_ADDRESS.toUpperCase()]
            },
            access: { type: 'allow-list', wallets: [] },
            streaming: { type: 'allow-list', wallets: [] }
          }
        })
      )
      next.mockResolvedValueOnce({ status: 200 })
    })

    it('should allow the request (case-insensitive)', async () => {
      const result = await authorizationMiddleware(buildCtx(DEPLOYER_ADDRESS), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when the signer is not the owner and has no deployer permissions', () => {
    describe('and allowAuthorizedAddresses is false (default)', () => {
      beforeEach(() => {
        getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
      })

      it('should respond with 401 and the appropriate error message', async () => {
        const result = await authorizationMiddleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

        expect(next).not.toHaveBeenCalled()
        expect(result).toEqual({
          status: 401,
          body: { message: 'Unauthorized: Signer is not authorized to perform operations on this world' }
        })
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
              return Promise.resolve(AUTHORITATIVE_ADDRESS)
            }
            return Promise.resolve(undefined)
          })
          next.mockResolvedValueOnce({ status: 200 })
        })

        it('should allow the request', async () => {
          const result = await middleware(buildCtx(AUTHORITATIVE_ADDRESS), next)

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
              return Promise.resolve(`${AUTHORIZED_ADDRESS}, 0x789`)
            }
            return Promise.resolve(undefined)
          })
          next.mockResolvedValueOnce({ status: 200 })
        })

        it('should allow the request', async () => {
          const result = await middleware(buildCtx(AUTHORIZED_ADDRESS), next)

          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200 })
        })
      })

      describe('and the signer is not in any allowed addresses', () => {
        beforeEach(() => {
          getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
          configGetString.mockImplementation((key: string) => {
            if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
              return Promise.resolve('0xdef')
            }
            if (key === 'AUTHORIZED_ADDRESSES') {
              return Promise.resolve('0x789, 0xghi')
            }
            return Promise.resolve(undefined)
          })
        })

        it('should respond with 401 and the appropriate error message', async () => {
          const result = await middleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

          expect(next).not.toHaveBeenCalled()
          expect(result).toEqual({
            status: 401,
            body: { message: 'Unauthorized: Signer is not authorized to perform operations on this world' }
          })
          expect(warn).toHaveBeenCalled()
        })
      })

      describe('and both authoritative and authorized addresses configs are empty', () => {
        beforeEach(() => {
          getPermissionsMock.mockResolvedValueOnce(buildWorldPermissions())
          configGetString.mockResolvedValue(undefined)
        })

        it('should respond with 401 and the appropriate error message', async () => {
          const result = await middleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

          expect(next).not.toHaveBeenCalled()
          expect(result).toEqual({
            status: 401,
            body: { message: 'Unauthorized: Signer is not authorized to perform operations on this world' }
          })
          expect(warn).toHaveBeenCalled()
        })
      })
    })
  })
})
