import type { IWorldStorageComponent } from './types'
import type { WorldStorageItem } from '../../adapters/db/world-storage-db/types'
import type { AppComponents } from '../../types'

export const createWorldStorageComponent = ({
  worldStorageDb
}: Pick<AppComponents, 'worldStorageDb'>): IWorldStorageComponent => {
  async function getValue(worldName: string, key: string): Promise<string | null> {
    return await worldStorageDb.getValue(worldName, key)
  }

  async function setValue(worldName: string, key: string, value: string): Promise<WorldStorageItem> {
    return await worldStorageDb.setValue(worldName, key, value)
  }

  async function deleteValue(worldName: string, key: string): Promise<void> {
    return await worldStorageDb.deleteValue(worldName, key)
  }

  return {
    getValue,
    setValue,
    deleteValue
  }
}
