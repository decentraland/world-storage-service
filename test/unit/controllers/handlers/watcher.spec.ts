import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { NotAuthorizedError } from '@dcl/http-commons'
import { getWatcherHandler } from '../../../../src/controllers/handlers/watcher/get-watcher'
import { createLogsMockedComponent } from '../../../mocks/components'
import type { ISceneLogsAccessComponent, WatcherScene } from '../../../../src/adapters/scene-logs-access/types'
import type { HandlerContextWithPath } from '../../../../src/types'

describe('getWatcherHandler', () => {
  let sceneLogsAccess: jest.Mocked<ISceneLogsAccessComponent>
  let ctx: Pick<HandlerContextWithPath<'sceneLogsAccess' | 'logs', '/watcher'>, 'url' | 'components'> &
    DecentralandSignatureContext<Record<string, unknown>>
  let scenes: WatcherScene[]

  beforeEach(() => {
    sceneLogsAccess = {
      upsertForScene: jest.fn(),
      touch: jest.fn(),
      removeScene: jest.fn(),
      listByAddress: jest.fn()
    }

    ctx = {
      url: new URL('http://localhost/watcher'),
      components: {
        sceneLogsAccess,
        logs: createLogsMockedComponent()
      },
      verification: { auth: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12', authMetadata: {} }
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when the request has no signer address', () => {
    beforeEach(() => {
      ctx.verification = undefined
    })

    it('should throw a NotAuthorizedError', async () => {
      await expect(getWatcherHandler(ctx)).rejects.toThrow(NotAuthorizedError)
    })
  })

  describe('when the request is signed', () => {
    beforeEach(() => {
      scenes = [
        {
          worldName: 'example.eth',
          baseParcel: '0,0',
          sceneId: 'bafybei-scene',
          title: 'Example Scene',
          realmKind: 'world'
        }
      ]

      sceneLogsAccess.listByAddress.mockResolvedValue({ data: scenes, total: 1 })
    })

    it('should query listByAddress with the lowercased signer address', async () => {
      await getWatcherHandler(ctx)

      expect(sceneLogsAccess.listByAddress).toHaveBeenCalledWith(
        '0xabcdef1234567890abcdef1234567890abcdef12',
        expect.any(Number),
        expect.any(Number)
      )
    })

    it('should query listByAddress with the parsed pagination parameters', async () => {
      ctx.url = new URL('http://localhost/watcher?limit=10&offset=5')

      await getWatcherHandler(ctx)

      expect(sceneLogsAccess.listByAddress).toHaveBeenCalledWith(expect.any(String), 10, 5)
    })

    it('should return the scenes with a paginated response shape', async () => {
      const response = await getWatcherHandler(ctx)

      expect(response).toEqual({
        status: 200,
        body: {
          data: scenes,
          pagination: { limit: 100, offset: 0, total: 1 }
        }
      })
    })

    it('should never derive the signer address from the request instead of the signature verification', async () => {
      ctx.url = new URL('http://localhost/watcher?address=0x0000000000000000000000000000000000dead')

      await getWatcherHandler(ctx)

      expect(sceneLogsAccess.listByAddress).toHaveBeenCalledWith(
        '0xabcdef1234567890abcdef1234567890abcdef12',
        expect.any(Number),
        expect.any(Number)
      )
    })
  })
})
