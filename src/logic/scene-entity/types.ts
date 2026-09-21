import type { WorldScene } from '../../adapters/worlds-content-server/types'

export interface ISceneEntityComponent {
  /**
   * Maps an untrusted scene entity payload to a `WorldScene`.
   *
   * @param entity - The scene entity as received from a content server or deployment event
   * @param sceneId - The entity id, resolved by the calling adapter from its own payload,
   * since content-addressed entity files carry no id of their own
   * @returns The mapped scene, or `null` when `base`/`parcels` are missing
   */
  mapSceneEntity(entity: unknown, sceneId: string): WorldScene | null

  /**
   * Coerces an untrusted scene title to bounded, control-character-free plain text.
   *
   * @param value - The raw `metadata.display.title` value
   * @returns The normalized title, or `null` when it is absent or empty once cleaned
   */
  normalizeTitle(value: unknown): string | null

  /**
   * @param metadata - A scene/world entity's metadata
   * @returns The lowercased `logsPermissions` string entries, or [] when absent or malformed
   */
  extractLogsPermissions(metadata: unknown): string[]
}
