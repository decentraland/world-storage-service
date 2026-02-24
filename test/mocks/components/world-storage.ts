import type { IWorldStorageComponent } from '../../../src/adapters/world-storage/types'

export function createWorldStorageMockedComponent(): jest.Mocked<IWorldStorageComponent> {
  return {
    getValue: jest.fn(),
    setValue: jest.fn(),
    deleteValue: jest.fn(),
    deleteAll: jest.fn(),
    listValues: jest.fn(),
    countKeys: jest.fn(),
    getSizeInfo: jest.fn()
  }
}
