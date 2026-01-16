export interface WorldPermissions {
  permissions: {
    deployment: {
      type: string
      wallets: string[]
    }
  }
  owner: string
}

export interface IWorldsContentServerComponent {
  getPermissions(worldName: string): Promise<WorldPermissions>
}
