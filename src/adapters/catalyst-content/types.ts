import type { WorldScene } from '../worlds-content-server/types'

export interface ICatalystContentComponent {
  /**
   * @param parcel - Genesis City parcel "x,y".
   * @returns The active scene entity for `parcel`, or null when none is deployed.
   */
  getActiveSceneEntity(parcel: string): Promise<WorldScene | null>
}
