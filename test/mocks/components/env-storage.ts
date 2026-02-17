import type { IEnvStorageComponent } from '../../../src/adapters/env-storage/types'

export function createEnvStorageMockedComponent(): jest.Mocked<IEnvStorageComponent> {
  return {
    getValue: jest.fn(),
    setValue: jest.fn(),
    deleteValue: jest.fn(),
    deleteAll: jest.fn(),
    listKeys: jest.fn(),
    countKeys: jest.fn(),
    getUpsertSizeInfo: jest.fn()
  }
}
