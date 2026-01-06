import type { WorldStorageItem } from '../../adapters/db/world-storage-db/types'

export interface IWorldStorageComponent {
  getValue(worldName: string, key: string): Promise<string | null>
  setValue(worldName: string, key: string, value: string): Promise<WorldStorageItem>
  deleteValue(worldName: string, key: string): Promise<void>
}
