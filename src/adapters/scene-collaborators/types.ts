/** A scene a wallet may collaborate on. Collaborators are the wallets in a scene's `logsPermissions` at this time. */
export interface CollaboratorScene {
  worldName: string
  baseParcel: string
  sceneId: string
  title: string | null
  realmKind: 'world' | 'genesis'
}

export interface SceneCollaboratorsRow extends CollaboratorScene {
  address: string
  deployedAt: number
}

export interface CollaboratorSceneDeployment extends CollaboratorScene {
  addresses: string[]
  deployedAt: number
  /** Base URL of the worlds server the scene came from; null/absent = the default server (or Genesis). */
  sourceContentServerUrl?: string | null
}

export interface ISceneCollaboratorsComponent {
  /**
   * Replaces the address set for a scene with `addresses` (lowercased), deleting rows
   * for addresses no longer present and upserting the rest. Skipped when a newer deployment
   * (higher `deployedAt`) is already indexed at the scene's world/parcel, so out-of-order
   * SQS delivery cannot let a stale deployment overwrite a newer one.
   *
   * @param scene - Scene identifiers, the full new address set, the deployment timestamp and source server
   */
  upsertForScene(scene: CollaboratorSceneDeployment): Promise<void>

  /**
   * Inserts a single (scene, address) row if absent; a no-op when it already exists.
   *
   * @param row - The scene/address row to insert
   */
  insert(row: SceneCollaboratorsRow): Promise<void>

  /**
   * Removes every row for a scene that came from `sourceContentServerUrl`.
   *
   * @param sceneId - The scene identifier
   * @param sourceContentServerUrl - The undeploying server; null (default) = the default worlds server
   */
  removeByScene(sceneId: string, sourceContentServerUrl?: string | null): Promise<void>

  /**
   * Removes every row for a world that came from `sourceContentServerUrl` (used when a whole
   * world is undeployed), leaving rows another server deployed.
   *
   * @param worldName - The world identifier
   * @param sourceContentServerUrl - The undeploying server; null (default) = the default worlds server
   */
  removeByWorld(worldName: string, sourceContentServerUrl?: string | null): Promise<void>

  /**
   * Returns a page of scenes a wallet may watch, newest first.
   *
   * @param address - The wallet address (case-insensitive)
   * @param limit - Maximum number of rows to return
   * @param offset - Number of rows to skip
   * @returns The page of scenes and the total matching count
   */
  listByAddress(address: string, limit: number, offset: number): Promise<{ data: CollaboratorScene[]; total: number }>
}
