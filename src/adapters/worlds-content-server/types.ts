export interface WorldPermissions {
  permissions: {
    /**
     * Deployment access control for the world. `wallets` is only present (and meaningful)
     * when `type` is `allow-list`; other types (e.g. `unrestricted`) omit it. `type` is left
     * open as `string` because the upstream worlds content server owns the set of values —
     * any unrecognised type fails closed in the permission checks.
     */
    deployment: {
      type: string
      wallets?: string[]
    }
  }
  owner: string
}

export interface WorldScene {
  /** Entity id (scene hash). */
  sceneId: string
  /** Base parcel "x,y" of the scene. */
  base: string
  /** All parcels the scene occupies. */
  parcels: string[]
  /** Human title (metadata.display.title), or null. */
  title: string | null
  /** Entity deployment timestamp (ms), used to order deployment events; 0 when absent. */
  deployedAt: number
  /** Lowercased addresses allowed to view this scene's logs (from scene metadata). */
  logsPermissions: string[]
}

export interface IWorldsContentServerComponent {
  getPermissions(worldName: string): Promise<WorldPermissions>
  getScenes(worldName: string): Promise<WorldScene[]>
}
