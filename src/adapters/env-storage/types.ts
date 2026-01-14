export interface EnvStorageItem {
  worldName: string
  key: string
  value: string
}

export interface IEnvStorageComponent {
  getValue(worldName: string, key: string): Promise<string | null>
  setValue(worldName: string, key: string, value: string): Promise<EnvStorageItem>
  deleteValue(worldName: string, key: string): Promise<void>
}
