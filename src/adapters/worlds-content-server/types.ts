export interface WorldPermissions {
  permissions: {
    deployment: {
      type: string
      wallets: string[]
    }
    access: {
      type: string
      wallets: string[]
    }
    streaming: {
      type: string
      wallets: string[]
    }
  }
  owner: string
}

export interface IWorldsContentServerComponent {
  getPermissions(worldName: string): Promise<WorldPermissions>
}
