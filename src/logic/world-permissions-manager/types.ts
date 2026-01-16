export interface IWorldPermissionsManagerComponent {
  /**
   * Check if an address has permission over a world (owner OR deployer)
   */
  hasWorldPermission(worldName: string, address: string): Promise<boolean>
}
