import type { ILoggerComponent } from '@well-known-components/interfaces'
import { deleteWorldStorageHandler } from '../../../../src/controllers/handlers/delete-world-storage'
import type { IWorldStorageComponent } from '../../../../src/logic/world-storage/types'
import type { HTTPResponse } from '../../../../src/types/http'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../../src/types/system'

describe('when handling a delete world storage request', () => {
  let logs: ILoggerComponent
  let logger: { info: jest.Mock; error: jest.Mock }
  let worldStorage: jest.Mocked<Pick<IWorldStorageComponent, 'getValue' | 'setValue' | 'deleteValue'>>

  let url: URL
  let worldName: string | undefined
  let params: { key: string }
  let context: Pick<
    HandlerContextWithPath<'logs' | 'worldStorage', '/storage/world/:key'>,
    'url' | 'components' | 'params'
  > &
    WorldStorageContext

  let response: HTTPResponse

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      error: jest.fn()
    }

    logs = {
      getLogger: jest.fn().mockReturnValue(logger)
    } as unknown as ILoggerComponent

    worldStorage = {
      getValue: jest.fn(),
      setValue: jest.fn(),
      deleteValue: jest.fn()
    }

    url = new URL('http://localhost/storage/world/my-key')
    worldName = 'my-world'
    params = { key: 'my-key' }

    context = {
      url,
      params,
      worldName,
      components: {
        logs,
        worldStorage
      }
    }

    response = { status: 0 }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the world name is missing', () => {
    beforeEach(() => {
      worldName = undefined
      context.worldName = worldName
    })

    it('should throw an error', async () => {
      await expect(deleteWorldStorageHandler(context)).rejects.toThrow('World name and key are required')
    })
  })

  describe('and the key param is missing', () => {
    beforeEach(() => {
      params = { key: '' }
      context.params = params
    })

    it('should throw an error', async () => {
      await expect(deleteWorldStorageHandler(context)).rejects.toThrow('World name and key are required')
    })
  })

  describe('and the delete succeeds', () => {
    beforeEach(async () => {
      ;(worldStorage.deleteValue as jest.Mock).mockResolvedValueOnce(undefined)
      response = await deleteWorldStorageHandler(context)
    })

    it('should call deleteValue with world name and key', () => {
      expect(worldStorage.deleteValue).toHaveBeenCalledWith('my-world', 'my-key')
    })

    it('should respond with a 204', () => {
      expect(response).toEqual({
        status: 204
      })
    })
  })

  describe('and the storage delete throws an error', () => {
    beforeEach(async () => {
      ;(worldStorage.deleteValue as jest.Mock).mockRejectedValueOnce(new Error('boom'))
      response = await deleteWorldStorageHandler(context)
    })

    it('should respond with a 500 and the error message', () => {
      expect(response).toEqual({
        status: 500,
        body: {
          message: 'boom'
        }
      })
    })
  })
})
