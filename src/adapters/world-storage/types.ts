export interface WorldStorageItem {
  worldName: string
  key: string
  value: unknown
}

export interface IWorldStorageComponent {
  getValue(worldName: string, key: string): Promise<unknown | null>
  setValue(worldName: string, key: string, value: unknown): Promise<WorldStorageItem>
  deleteValue(worldName: string, key: string): Promise<void>
}
