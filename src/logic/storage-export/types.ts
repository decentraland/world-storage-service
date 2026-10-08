import type { IBaseComponent } from '@well-known-components/interfaces'

export interface IStorageExportComponent extends IBaseComponent {
  /** Sweeps expired and stale jobs, then claims and builds one pending export; resolves true when a job was claimed. */
  processNextJob(): Promise<boolean>
}
