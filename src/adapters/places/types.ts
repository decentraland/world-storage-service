/**
 * Places API adapter for resolving place IDs from world name and parcel coordinates
 */
export interface IPlacesComponent {
  /**
   * Resolves a place ID from the Places API using the world name and parcel coordinates.
   *
   * For Genesis City (world_name = "main"): queries by position only.
   * For worlds (*.dcl.eth): queries by world name and position.
   *
   * @param worldName - The world identifier ("main" for Genesis City, or a world name like "myworld.dcl.eth")
   * @param parcel - The base parcel coordinate (e.g. "0,0")
   * @returns The place ID (UUID string)
   * @throws {InvalidRequestError} If the scene is not found in the Places API
   */
  resolvePlaceId(worldName: string, parcel: string): Promise<string>
}
