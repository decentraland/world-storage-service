export interface WatcherScene {
  worldName: string
  baseParcel: string
  sceneId: string
  title: string | null
  realmKind: 'world' | 'genesis'
}

export interface SceneLogsAccessRow extends WatcherScene {
  address: string
}

export interface ISceneLogsAccessComponent {
  /**
   * Replaces the address set for a scene with `addresses` (lowercased), deleting rows
   * for addresses no longer present and upserting the rest.
   *
   * @param scene - Scene identifiers plus the full new address set
   */
  upsertForScene(scene: WatcherScene & { addresses: string[] }): Promise<void>

  /**
   * Inserts a single (scene, address) row if absent; a no-op when it already exists.
   *
   * @param row - The scene/address row to insert
   */
  touch(row: SceneLogsAccessRow): Promise<void>

  /**
   * Removes every row for a scene.
   *
   * @param sceneId - The scene identifier
   */
  removeScene(sceneId: string): Promise<void>

  /**
   * Returns a page of scenes a wallet may watch, newest first.
   *
   * @param address - The wallet address (case-insensitive)
   * @param limit - Maximum number of rows to return
   * @param offset - Number of rows to skip
   * @returns The page of scenes and the total matching count
   */
  listByAddress(address: string, limit: number, offset: number): Promise<{ data: WatcherScene[]; total: number }>
}
