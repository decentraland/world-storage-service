import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { Authenticator } from '@dcl/crypto'
import { NotAuthorizedError } from '@dcl/http-commons'
import {
  authorizationMiddleware,
  createAuthorizationMiddleware,
  logsAccessAuthorizationMiddleware
} from '../../../../src/controllers/middlewares/authorization-middleware'
import { ADDRESSES, PARCELS, WORLD_NAMES } from '../../../fixtures'
import { createLogsMockedComponent } from '../../../mocks/components'
import { buildTestContext } from '../../utils/context'
import type { WorldScene } from '../../../../src/adapters/worlds-content-server/types'
import type { BaseComponents } from '../../../../src/types'
import type { TestContext } from '../../utils/context'

const LOGS_READABLE_SCENE: WorldScene = {
  sceneId: 'bafkrei-logs-scene',
  base: PARCELS.DEFAULT,
  parcels: [PARCELS.DEFAULT],
  title: 'Test scene',
  logsPermissions: [ADDRESSES.UNAUTHORIZED]
}

describe('Authorization Middleware', () => {
  const next = jest.fn()
  let middleware: ReturnType<typeof createAuthorizationMiddleware>
  let configGetString: jest.Mock
  let hasWorldPermissionMock: jest.Mock
  let getLogsAccessibleSceneMock: jest.Mock
  let touchMock: jest.Mock

  beforeEach(() => {
    configGetString = jest.fn()
    hasWorldPermissionMock = jest.fn()
    getLogsAccessibleSceneMock = jest.fn()
    touchMock = jest.fn().mockResolvedValue(undefined)
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
      parcel: PARCELS.DEFAULT,
      verification: { auth: auth ?? '', authMetadata: {} },
      components: {
        config: { getString: configGetString },
        logs: createLogsMockedComponent(),
        worldPermission: {
          hasWorldPermission: hasWorldPermissionMock,
          getLogsAccessibleScene: getLogsAccessibleSceneMock
        },
        sceneLogsAccess: { touch: touchMock }
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

        expect(hasWorldPermissionMock).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          ADDRESSES.OWNER.toLowerCase(),
          PARCELS.DEFAULT
        )
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

      describe('and the request carries a world-scoped storage delegation', () => {
        // Real keypairs: the authoritative server that signs the scope claim, and
        // the throwaway ephemeral the worker signs its storage request with.
        const authoritative = createUnsafeIdentity()
        const ephemeral = createUnsafeIdentity()
        const SCENE_ID = 'bafkrei-scene'

        function buildScopeHeader(
          opts: {
            world?: string
            sceneId?: string
            parcel?: string
            ephemeralAddress?: string
            expiration?: number
            signer?: typeof authoritative
          } = {}
        ): string {
          const world = (opts.world ?? WORLD_NAMES.DEFAULT).toLowerCase()
          const sceneId = opts.sceneId ?? SCENE_ID
          const parcel = opts.parcel ?? PARCELS.DEFAULT
          const ephemeralAddress = (opts.ephemeralAddress ?? ephemeral.address).toLowerCase()
          const expiration = opts.expiration ?? Date.now() + 3_600_000
          const signer = opts.signer ?? authoritative
          const payload = [
            'Decentraland Authoritative Storage Delegation',
            `Ephemeral: ${ephemeralAddress}`,
            `World: ${world}`,
            `SceneId: ${sceneId}`,
            `Parcel: ${parcel}`,
            `Expiration: ${new Date(expiration).toISOString()}`
          ].join('\n')
          const signature = Authenticator.createSignature(signer, payload)
          return Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString('base64')
        }

        function buildScopedCtx(auth: string, scopeHeader?: string): TestContext {
          return buildTestContext({
            worldName: WORLD_NAMES.DEFAULT,
            parcel: PARCELS.DEFAULT,
            // The worker echoes the delegation's sceneId into the signed metadata;
            // the middleware reads it back to match against the claim.
            verification: { auth, authMetadata: { sceneId: SCENE_ID } },
            request: new Request('http://localhost/values/key', {
              headers: scopeHeader ? { 'x-authoritative-scope': scopeHeader } : {}
            }),
            components: {
              config: { getString: configGetString },
              logs: createLogsMockedComponent(),
              worldPermission: {
                hasWorldPermission: hasWorldPermissionMock,
                getLogsAccessibleScene: getLogsAccessibleSceneMock
              }
            } as unknown as BaseComponents
          })
        }

        beforeEach(() => {
          // Scoped delegation is only accepted on the /values preset (flag on).
          middleware = createAuthorizationMiddleware({
            allowAuthorizedAddresses: true,
            allowOwnersAndDeployers: true,
            allowScopedDelegation: true
          })
          mockConfig({ AUTHORITATIVE_SERVER_ADDRESS: authoritative.address })
          // The ephemeral is neither an authorized address nor an owner/deployer,
          // so only the scoped-delegation path can authorize it.
          hasWorldPermissionMock.mockResolvedValue(false)
        })

        describe('and the middleware does not enable scoped delegation', () => {
          let noDelegationMiddleware: ReturnType<typeof createAuthorizationMiddleware>
          let scopedCtx: TestContext

          beforeEach(() => {
            // allowScopedDelegation omitted → defaults to false, so the scope header
            // is never consulted regardless of how valid it is.
            noDelegationMiddleware = createAuthorizationMiddleware({
              allowAuthorizedAddresses: true,
              allowOwnersAndDeployers: false
            })
            scopedCtx = buildScopedCtx(ephemeral.address, buildScopeHeader())
          })

          it('should ignore a valid scope header and deny', async () => {
            await expect(noDelegationMiddleware(scopedCtx, next)).rejects.toThrow(NotAuthorizedError)
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and the delegation is valid', () => {
          beforeEach(() => {
            next.mockResolvedValueOnce({ status: 200 })
          })

          it('should authorize without checking world permissions', async () => {
            const result = await middleware(buildScopedCtx(ephemeral.address, buildScopeHeader()), next)

            expect(hasWorldPermissionMock).not.toHaveBeenCalled()
            expect(next).toHaveBeenCalled()
            expect(result).toEqual({ status: 200 })
          })
        })

        describe('and the claim is signed by an untrusted address', () => {
          it('should not authorize', async () => {
            const attacker = createUnsafeIdentity()
            await expect(
              middleware(buildScopedCtx(ephemeral.address, buildScopeHeader({ signer: attacker })), next)
            ).rejects.toThrow(NotAuthorizedError)
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and the claim binds a different ephemeral than the request signer', () => {
          it('should not authorize (blocks replay with another key)', async () => {
            const other = createUnsafeIdentity()
            await expect(middleware(buildScopedCtx(other.address, buildScopeHeader()), next)).rejects.toThrow(
              NotAuthorizedError
            )
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and the claim is for a different world', () => {
          it('should not authorize', async () => {
            await expect(
              middleware(buildScopedCtx(ephemeral.address, buildScopeHeader({ world: 'other.dcl.eth' })), next)
            ).rejects.toThrow(NotAuthorizedError)
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and the claim is for a different scene', () => {
          it('should not authorize (confines the worker to its own scene)', async () => {
            await expect(
              middleware(buildScopedCtx(ephemeral.address, buildScopeHeader({ sceneId: 'bafkrei-other' })), next)
            ).rejects.toThrow(NotAuthorizedError)
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and the claim is for a different parcel', () => {
          it('should not authorize (the parcel pins the placeId)', async () => {
            await expect(
              middleware(buildScopedCtx(ephemeral.address, buildScopeHeader({ parcel: '99,99' })), next)
            ).rejects.toThrow(NotAuthorizedError)
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and the delegation has expired', () => {
          it('should not authorize', async () => {
            await expect(
              middleware(buildScopedCtx(ephemeral.address, buildScopeHeader({ expiration: Date.now() - 1_000 })), next)
            ).rejects.toThrow(NotAuthorizedError)
            expect(next).not.toHaveBeenCalled()
          })
        })

        describe('and no scope header is present', () => {
          it('should not authorize', async () => {
            await expect(middleware(buildScopedCtx(ephemeral.address, undefined), next)).rejects.toThrow(
              NotAuthorizedError
            )
            expect(next).not.toHaveBeenCalled()
          })
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

            expect(hasWorldPermissionMock).toHaveBeenCalledWith(
              WORLD_NAMES.DEFAULT,
              ADDRESSES.OWNER.toLowerCase(),
              PARCELS.DEFAULT
            )
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

  describe('when allowLogsAccess is true', () => {
    beforeEach(() => {
      middleware = createAuthorizationMiddleware({
        allowAuthorizedAddresses: false,
        allowOwnersAndDeployers: false,
        allowLogsAccess: true
      })
      hasWorldPermissionMock.mockResolvedValue(false)
    })

    describe('and getLogsAccessibleScene resolves a scene', () => {
      beforeEach(() => {
        getLogsAccessibleSceneMock.mockResolvedValueOnce(LOGS_READABLE_SCENE)
        next.mockResolvedValueOnce({ status: 200 })
      })

      it('should allow the request', async () => {
        const result = await middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)

        expect(getLogsAccessibleSceneMock).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          ADDRESSES.UNAUTHORIZED.toLowerCase(),
          PARCELS.DEFAULT
        )
        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200 })
      })

      it('should fire-and-forget a watcher backfill upsert with the scene and lowercased signer', async () => {
        await middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)

        expect(touchMock).toHaveBeenCalledTimes(1)
        expect(touchMock).toHaveBeenCalledWith({
          address: ADDRESSES.UNAUTHORIZED.toLowerCase(),
          sceneId: LOGS_READABLE_SCENE.sceneId,
          worldName: WORLD_NAMES.DEFAULT,
          baseParcel: LOGS_READABLE_SCENE.base,
          title: LOGS_READABLE_SCENE.title,
          realmKind: 'world'
        })
      })

      it('should touch only once across repeated grants for the same scene and wallet', async () => {
        getLogsAccessibleSceneMock.mockResolvedValue(LOGS_READABLE_SCENE)
        next.mockResolvedValue({ status: 200 })

        await middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)
        await middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)

        expect(touchMock).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the watcher backfill upsert rejects', () => {
      beforeEach(() => {
        getLogsAccessibleSceneMock.mockResolvedValueOnce(LOGS_READABLE_SCENE)
        touchMock.mockRejectedValueOnce(new Error('insert failed'))
        next.mockResolvedValueOnce({ status: 200 })
      })

      it('should still allow the request', async () => {
        const result = await middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)
        await Promise.resolve()

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200 })
      })
    })

    describe('and getLogsAccessibleScene resolves null', () => {
      beforeEach(() => {
        getLogsAccessibleSceneMock.mockResolvedValueOnce(null)
      })

      it('should throw a NotAuthorizedError', async () => {
        await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
          new NotAuthorizedError('Unauthorized: Signer is not authorized to perform operations on this world')
        )
        expect(next).not.toHaveBeenCalled()
      })

      it('should never call the watcher backfill upsert', async () => {
        await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(NotAuthorizedError)
        expect(touchMock).not.toHaveBeenCalled()
      })
    })

    describe('and getLogsAccessibleScene rejects', () => {
      beforeEach(() => {
        getLogsAccessibleSceneMock.mockRejectedValueOnce(new Error('Failed to resolve scene'))
      })

      it('should throw a NotAuthorizedError', async () => {
        await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(
          new NotAuthorizedError('Unauthorized: Failed to verify logs-access permission')
        )
        expect(next).not.toHaveBeenCalled()
      })
    })
  })

  describe('when allowLogsAccess is false (default)', () => {
    beforeEach(() => {
      middleware = createAuthorizationMiddleware({
        allowAuthorizedAddresses: false,
        allowOwnersAndDeployers: false
      })
      hasWorldPermissionMock.mockResolvedValue(false)
    })

    it('should never consult getLogsAccessibleScene', async () => {
      await expect(middleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(NotAuthorizedError)
      expect(getLogsAccessibleSceneMock).not.toHaveBeenCalled()
    })
  })

  describe('the logsAccessAuthorizationMiddleware preset', () => {
    it('should grant access when getLogsAccessibleScene resolves a scene', async () => {
      hasWorldPermissionMock.mockResolvedValueOnce(false)
      getLogsAccessibleSceneMock.mockResolvedValueOnce(LOGS_READABLE_SCENE)
      next.mockResolvedValueOnce({ status: 200 })

      const result = await logsAccessAuthorizationMiddleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('the authorizationMiddleware preset', () => {
    it('should never consult getLogsAccessibleScene, even when it would grant access', async () => {
      hasWorldPermissionMock.mockResolvedValueOnce(false)
      getLogsAccessibleSceneMock.mockResolvedValueOnce(LOGS_READABLE_SCENE)

      await expect(authorizationMiddleware(buildCtx(ADDRESSES.UNAUTHORIZED), next)).rejects.toThrow(NotAuthorizedError)
      expect(getLogsAccessibleSceneMock).not.toHaveBeenCalled()
      expect(next).not.toHaveBeenCalled()
    })
  })
})
