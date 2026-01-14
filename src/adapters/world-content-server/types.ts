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

export interface IWorldContentServerComponent {
  getPermissions(worldName: string): Promise<WorldPermissions>
}
