import { NotAuthorizedError } from '@dcl/http-commons'
import { createAuthorizationMiddleware } from '../../../../src/controllers/middlewares/authorization-middleware'
import { ADDRESSES, WORLD_NAMES } from '../../../fixtures'
import { createLogsMockedComponent } from '../../../mocks/components'
import { buildTestContext } from '../../utils/context'
import type { BaseComponents } from '../../../../src/types'
import type { TestContext } from '../../utils/context'

describe('Authorization Middleware', () => {
  const next = jest.fn()
  let middleware: ReturnType<typeof createAuthorizationMiddleware>
  let configGetString: jest.Mock
  let hasWorldPermissionMock: jest.Mock

  beforeEach(() => {
    configGetString = jest.fn()
    hasWorldPermissionMock = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function mockConfig(values: Partial<Record<string, string>>) {
    configGetString.mockImplementation((key: string) => Promise.resolve(values[key]))
  }

  function buildCtx(auth?: string): TestContext {
    return buildTestContext({
      worldName: WORLD_NAMES.DEFAULT,
      verification: { auth: auth ?? '', authMetadata: {} },
      components: {
        config: { getString: configGetString },
        logs: createLogsMockedComponent(),
        worldPermission: { hasWorldPermission: hasWorldPermissionMock }
      } as unknown as BaseComponents
    })
  }

  describe('when the signer address is missing', () => {
    beforeEach(() => {
      middleware = createAuthorizationMiddleware({
        allowAuthorizedAddresses: true,
        allowOwnersAndDeployers: true
      })
    })

    it('should throw a NotAuthorizedError', async () => {
      await expect(middleware(buildCtx(undefined), next)).rejects.toThrow(
        new NotAuthorizedError('Unauthorized: No signer address found')
      )
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when allowAuthorizedAddresses is false', () => {
    beforeEach(() => {
      middleware = createAuthorizationMiddleware({
        allowAuthorizedAddresses: false,
        allowOwnersAndDeployers: true
      })
    })

    describe('and the signer has world permission', () => {
      beforeEach(() => {
        hasWorldPermissionMock.mockResolvedValueOnce(true)
        next.mockResolvedValueOnce({ status: 200 })
      })

      it('should allow the request', async () => {
        const result = await middleware(buildCtx(ADDRESSES.OWNER), next)

        expect(hasWorldPermissionMock).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, ADDRESSES.OWNER.toLowerCase())
        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200 })
      })
    })

    describe('and the signer does not have world permission', () => {
      beforeEach(() => {
        hasWorldPermissionMock.mockResolvedValueOnce(false)
      })

      it('should throw a NotAuthorizedError', async () => {
        await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
          new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
        )
        expect(next).not.toHaveBeenCalled()
      })
    })

    describe('and the world permission check fails', () => {
      beforeEach(() => {
        hasWorldPermissionMock.mockRejectedValueOnce(new Error('Failed to fetch world permissions'))
      })

      it('should throw a NotAuthorizedError', async () => {
        await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
          new NotAuthorizedError('Unauthorized: Failed to verify world permissions')
        )
        expect(next).not.toHaveBeenCalled()
      })
    })
  })

  describe('when allowAuthorizedAddresses is true', () => {
    describe('and allowOwnersAndDeployers is true', () => {
      beforeEach(() => {
        middleware = createAuthorizationMiddleware({
          allowAuthorizedAddresses: true,
          allowOwnersAndDeployers: true
        })
      })

      describe('and the signer matches the authoritative server address', () => {
        beforeEach(() => {
          mockConfig({ AUTHORITATIVE_SERVER_ADDRESS: ADDRESSES.AUTHORITATIVE })
          next.mockResolvedValueOnce({ status: 200 })
        })

        it('should allow the request without checking world permissions', async () => {
          const result = await middleware(buildCtx(ADDRESSES.AUTHORITATIVE), next)

          expect(hasWorldPermissionMock).not.toHaveBeenCalled()
          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200 })
        })
      })

      describe('and the signer is in the authorized addresses list', () => {
        beforeEach(() => {
          mockConfig({ AUTHORIZED_ADDRESSES: `${ADDRESSES.AUTHORIZED}, ${ADDRESSES.ANOTHER_AUTHORIZED}` })
          next.mockResolvedValueOnce({ status: 200 })
        })

        it('should allow the request without checking world permissions', async () => {
          const result = await middleware(buildCtx(ADDRESSES.AUTHORIZED), next)

          expect(hasWorldPermissionMock).not.toHaveBeenCalled()
          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200 })
        })
      })

      describe('and the signer is not in the authorized addresses list', () => {
        beforeEach(() => {
          mockConfig({
            AUTHORITATIVE_SERVER_ADDRESS: ADDRESSES.OTHER,
            AUTHORIZED_ADDRESSES: `${ADDRESSES.ANOTHER_AUTHORIZED}, 0xghi`
          })
        })

        describe('and the signer has world permission', () => {
          beforeEach(() => {
            hasWorldPermissionMock.mockResolvedValueOnce(true)
            next.mockResolvedValueOnce({ status: 200 })
          })

          it('should allow the request', async () => {
            const result = await middleware(buildCtx(ADDRESSES.OWNER), next)

            expect(hasWorldPermissionMock).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, ADDRESSES.OWNER.toLowerCase())
            expect(next).toHaveBeenCalled()
            expect(result).toEqual({ status: 200 })
          })
        })

        describe('and the signer does not have world permission', () => {
          beforeEach(() => {
            hasWorldPermissionMock.mockResolvedValueOnce(false)
          })

          it('should throw a NotAuthorizedError', async () => {
            await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
              new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
            )
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and the world permission check fails', () => {
          beforeEach(() => {
            hasWorldPermissionMock.mockRejectedValueOnce(new Error('Failed to fetch world permissions'))
          })

          it('should throw a NotAuthorizedError', async () => {
            await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
              new NotAuthorizedError('Unauthorized: Failed to verify world permissions')
            )
            expect(next).not.toHaveBeenCalled()
          })
        })
      })
    })

    describe('and allowOwnersAndDeployers is false', () => {
      beforeEach(() => {
        middleware = createAuthorizationMiddleware({
          allowAuthorizedAddresses: true,
          allowOwnersAndDeployers: false
        })
      })

      describe('and the signer matches the authoritative server address', () => {
        beforeEach(() => {
          mockConfig({ AUTHORITATIVE_SERVER_ADDRESS: ADDRESSES.AUTHORITATIVE })
          next.mockResolvedValueOnce({ status: 200 })
        })

        it('should allow the request without checking world permissions', async () => {
          const result = await middleware(buildCtx(ADDRESSES.AUTHORITATIVE), next)

          expect(hasWorldPermissionMock).not.toHaveBeenCalled()
          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200 })
        })
      })

      describe('and the signer is in the authorized addresses list', () => {
        beforeEach(() => {
          mockConfig({ AUTHORIZED_ADDRESSES: `${ADDRESSES.AUTHORIZED}, ${ADDRESSES.ANOTHER_AUTHORIZED}` })
          next.mockResolvedValueOnce({ status: 200 })
        })

        it('should allow the request without checking world permissions', async () => {
          const result = await middleware(buildCtx(ADDRESSES.AUTHORIZED), next)

          expect(hasWorldPermissionMock).not.toHaveBeenCalled()
          expect(next).toHaveBeenCalled()
          expect(result).toEqual({ status: 200 })
        })
      })

      describe('and the signer is not in the authorized addresses list', () => {
        beforeEach(() => {
          mockConfig({
            AUTHORITATIVE_SERVER_ADDRESS: ADDRESSES.OTHER,
            AUTHORIZED_ADDRESSES: `${ADDRESSES.ANOTHER_AUTHORIZED}, 0xghi`
          })
        })

        describe('and the signer has world permission', () => {
          beforeEach(() => {
            hasWorldPermissionMock.mockResolvedValueOnce(true)
          })

          it('should throw a NotAuthorizedError', async () => {
            await expect(middleware(buildCtx(ADDRESSES.OWNER), next)).rejects.toThrow(
              new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
            )
            expect(hasWorldPermissionMock).not.toHaveBeenCalled()
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and the signer does not have world permission', () => {
          beforeEach(() => {
            hasWorldPermissionMock.mockResolvedValueOnce(false)
          })

          it('should throw a NotAuthorizedError', async () => {
            await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
              new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
            )
            expect(hasWorldPermissionMock).not.toHaveBeenCalled()
            expect(next).not.toHaveBeenCalled()
          })
        })
      })
    })
  })
})
