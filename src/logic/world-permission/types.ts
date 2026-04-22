export interface IWorldPermissionComponent {
  /**
   * Check if an address has permission over a world/scene (owner OR deployer).
   *
   * For worlds (*.dcl.eth): checks via worlds-content-server.
   * For Genesis City (world_name = "main"): checks land permissions via LAMBDAS API.
   *
   * @param worldName - The world identifier ("main" for Genesis City, or "*.dcl.eth" for worlds)
   * @param address - The wallet address to check
   * @param parcel - The base parcel coordinate of the scene (used for Genesis City permission checks)
   * @returns `true` when the address is authorized to mutate the scene storage
   */
  hasWorldPermission(worldName: string, address: string, parcel: string): Promise<boolean>
}
