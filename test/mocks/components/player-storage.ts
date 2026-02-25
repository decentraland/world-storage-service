import type { IPlayerStorageComponent } from '../../../src/adapters/player-storage/types'

export function createPlayerStorageMockedComponent(): jest.Mocked<IPlayerStorageComponent> {
  return {
    getValue: jest.fn(),
    setValue: jest.fn(),
    deleteValue: jest.fn(),
    deleteAllForPlayer: jest.fn(),
    deleteAll: jest.fn(),
    listValues: jest.fn(),
    countKeys: jest.fn(),
    listPlayers: jest.fn(),
    countPlayers: jest.fn(),
    getSizeInfo: jest.fn()
  }
}
