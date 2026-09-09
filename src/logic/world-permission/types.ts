import type { WorldScene } from '../../adapters/worlds-content-server/types'

export interface IWorldPermissionComponent {
  /**
   * Check if an address has permission over a world/scene (owner OR deployer).
   *
   * For worlds (*.eth): checks via worlds-content-server.
   * For Genesis City (world_name = "main"): checks land permissions via LAMBDAS API.
   *
   * @param worldName - The world identifier ("main" for Genesis City, or "*.eth" for worlds)
   * @param address - The wallet address to check
   * @param parcel - The base parcel coordinate of the scene (used for Genesis City permission checks)
   * @returns `true` when the address is authorized to mutate the scene storage
   */
  hasWorldPermission(worldName: string, address: string, parcel: string): Promise<boolean>

  /**
   * Check if an address is listed in `logsPermissions` for the scene at `parcel`,
   * granting read-only access to that scene's storage.
   *
   * For worlds (*.eth): resolves the scene via worlds-content-server.
   * For Genesis City (world_name = "main"): resolves the active scene entity via catalyst content.
   *
   * @param worldName - The world identifier ("main" for Genesis City, or "*.eth" for worlds)
   * @param address - The wallet address to check
   * @param parcel - The parcel coordinate of the scene
   * @returns The matched `WorldScene` when the address is granted read access, else `null` (fails closed)
   */
  getLogsAccessibleScene(worldName: string, address: string, parcel: string): Promise<WorldScene | null>
}
