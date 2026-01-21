export interface IEnvStorageComponent {
  getValue(worldName: string, key: string): Promise<string | null>
  setValue(worldName: string, key: string, value: string): Promise<void>
  deleteValue(worldName: string, key: string): Promise<void>
  deleteAll(worldName: string): Promise<void>
}
