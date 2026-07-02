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

export interface IWorldsContentServerComponent {
  getPermissions(worldName: string): Promise<WorldPermissions>
}
