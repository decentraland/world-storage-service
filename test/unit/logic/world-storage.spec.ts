import { createWorldStorageComponent } from '../../../src/logic/world-storage/component'
import type { IWorldStorageDBComponent, WorldStorageItem } from '../../../src/adapters/db/world-storage-db'

describe('World Storage Component', () => {
  let worldStorageDb: jest.Mocked<Pick<IWorldStorageDBComponent, 'getValue' | 'setValue' | 'deleteValue'>>
  let component: ReturnType<typeof createWorldStorageComponent>

  let worldName: string
  let key: string
  let value: string
  let item: WorldStorageItem

  beforeEach(() => {
    worldStorageDb = {
      getValue: jest.fn(),
      setValue: jest.fn(),
      deleteValue: jest.fn()
    }

    component = createWorldStorageComponent({ worldStorageDb })

    worldName = 'my-world'
    key = 'my-key'
    value = 'my-value'
    item = { worldName, key, value }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when calling getValue', () => {
    describe('and the db resolves with a value', () => {
      let result: string | null

      beforeEach(async () => {
        worldStorageDb.getValue.mockResolvedValueOnce(value)
        result = await component.getValue(worldName, key)
      })

      it('should return the db value', () => {
        expect(result).toBe(value)
      })
    })

    describe('and the db rejects', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('boom')
        worldStorageDb.getValue.mockRejectedValueOnce(error)
      })

      it('should propagate the error', async () => {
        await expect(component.getValue(worldName, key)).rejects.toThrow(error)
      })
    })
  })

  describe('when calling setValue', () => {
    describe('and the db resolves with the stored item', () => {
      let result: WorldStorageItem

      beforeEach(async () => {
        worldStorageDb.setValue.mockResolvedValueOnce(item)
        result = await component.setValue(worldName, key, value)
      })

      it('should return the stored item', () => {
        expect(result).toEqual(item)
      })
    })

    describe('and the db rejects', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('boom')
        worldStorageDb.setValue.mockRejectedValueOnce(error)
      })

      it('should propagate the error', async () => {
        await expect(component.setValue(worldName, key, value)).rejects.toThrow(error)
      })
    })
  })

  describe('when calling deleteValue', () => {
    describe('and the db resolves', () => {
      beforeEach(async () => {
        worldStorageDb.deleteValue.mockResolvedValueOnce()
        await component.deleteValue(worldName, key)
      })

      it('should call the db delete', () => {
        expect(worldStorageDb.deleteValue).toHaveBeenCalledWith(worldName, key)
      })
    })

    describe('and the db rejects', () => {
      let error: Error

      beforeEach(() => {
        error = new Error('boom')
        worldStorageDb.deleteValue.mockRejectedValueOnce(error)
      })

      it('should propagate the error', async () => {
        await expect(component.deleteValue(worldName, key)).rejects.toThrow(error)
      })
    })
  })
})
