export interface IWorldStorageDBComponent {
  getValue(worldName: string, key: string): Promise<string | null>
  setValue(worldName: string, key: string, value: string): Promise<WorldStorageItem>
  deleteValue(worldName: string, key: string): Promise<void>
}

export interface WorldStorageItem {
  worldName: string
  key: string
  value: string
}
