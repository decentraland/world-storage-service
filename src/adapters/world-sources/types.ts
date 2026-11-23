export interface IWorldSourcesComponent {
  /**
   * Records the worlds server a world was last deployed from. Skipped when a newer
   * deployment (higher `deployedAt`) is already recorded, so the last deploy wins.
   *
   * @param worldName - The world name (case-insensitive)
   * @param sourceContentServerUrl - Base URL of the source server; null = the default worlds server
   * @param deployedAt - The deployment timestamp (ms)
   */
  recordDeployment(worldName: string, sourceContentServerUrl: string | null, deployedAt: number): Promise<void>

  /**
   * @param worldName - The world name (case-insensitive)
   * @returns The recorded source server base URL, or null when it is the default server or unknown
   */
  getSource(worldName: string): Promise<string | null>

  /**
   * Forgets the world's recorded source, only when it is `sourceContentServerUrl`.
   *
   * @param worldName - The world name (case-insensitive)
   * @param sourceContentServerUrl - The undeploying server; null = the default worlds server
   */
  removeIfSource(worldName: string, sourceContentServerUrl: string | null): Promise<void>
}
