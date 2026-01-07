import type { ILoggerComponent } from '@well-known-components/interfaces'
import { upsertWorldStorageHandler } from '../../../../src/controllers/handlers/upsert-world-storage'
import type { IWorldStorageComponent } from '../../../../src/logic/world-storage/types'
import type { HTTPResponse } from '../../../../src/types/http'
import type { HandlerContextWithPath, WorldStorageContext } from '../../../../src/types/system'

describe('when handling an upsert world storage request', () => {
  let logs: ILoggerComponent
  let logger: { info: jest.Mock; error: jest.Mock }
  let worldStorage: jest.Mocked<Pick<IWorldStorageComponent, 'getValue' | 'setValue' | 'deleteValue'>>

  let url: URL
  let worldName: string | undefined
  let params: { key: string }
  let request: { json: jest.Mock }
  let context: Pick<
    HandlerContextWithPath<'logs' | 'worldStorage', '/storage/world/:key'>,
    'url' | 'components' | 'params' | 'request'
  > &
    WorldStorageContext

  let response: HTTPResponse<unknown>

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
    request = {
      json: jest.fn()
    }

    context = {
      url,
      params,
      request: request as unknown as HandlerContextWithPath<'logs' | 'worldStorage', '/storage/world/:key'>['request'],
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
      await expect(upsertWorldStorageHandler(context)).rejects.toThrow('World name and key are required')
    })
  })

  describe('and the key param is missing', () => {
    beforeEach(() => {
      params = { key: '' }
      context.params = params
    })

    it('should throw an error', async () => {
      await expect(upsertWorldStorageHandler(context)).rejects.toThrow('World name and key are required')
    })
  })

  describe('and the request body is not valid JSON', () => {
    beforeEach(() => {
      request.json.mockRejectedValueOnce(new Error('invalid json'))
    })

    it('should throw an error', async () => {
      await expect(upsertWorldStorageHandler(context)).rejects.toThrow('Request body must be valid JSON')
    })
  })

  describe('and the request body does not include a value', () => {
    beforeEach(() => {
      request.json.mockResolvedValueOnce({})
    })

    it('should throw an error', async () => {
      await expect(upsertWorldStorageHandler(context)).rejects.toThrow('Value is required')
    })
  })

  describe('and the value is provided', () => {
    let value: unknown

    beforeEach(() => {
      value = { foo: 'bar' }
      request.json.mockResolvedValueOnce({ value })
    })

    describe('and the storage upsert succeeds', () => {
      beforeEach(async () => {
        ;(worldStorage.setValue as jest.Mock).mockResolvedValueOnce({
          worldName: 'my-world',
          key: 'my-key',
          value
        })
        response = await upsertWorldStorageHandler(context)
      })

      it('should call setValue with world name, key and value', () => {
        expect(worldStorage.setValue).toHaveBeenCalledWith('my-world', 'my-key', value)
      })

      it('should respond with a 200 and the stored value', () => {
        expect(response).toEqual({
          status: 200,
          body: {
            value
          }
        })
      })
    })

    describe('and the storage upsert throws an error', () => {
      beforeEach(async () => {
        ;(worldStorage.setValue as jest.Mock).mockRejectedValueOnce(new Error('boom'))
        response = await upsertWorldStorageHandler(context)
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
})
