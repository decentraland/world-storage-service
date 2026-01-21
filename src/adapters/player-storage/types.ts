export interface PlayerStorageItem {
  worldName: string
  playerAddress: string
  key: string
  value: unknown
}

export interface IPlayerStorageComponent {
  getValue(worldName: string, playerAddress: string, key: string): Promise<unknown | null>
  setValue(worldName: string, playerAddress: string, key: string, value: unknown): Promise<PlayerStorageItem>
  deleteValue(worldName: string, playerAddress: string, key: string): Promise<void>
  deleteAllForPlayer(worldName: string, playerAddress: string): Promise<void>
  deleteAll(worldName: string): Promise<void>
}
