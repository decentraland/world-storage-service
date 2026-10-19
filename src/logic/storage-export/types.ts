import type { Readable } from 'node:stream'

/** Output format of an export. */
export type ExportFormat = 'json' | 'csv'

/** Canonical export selection: `null` means all and `[]` means none. */
export interface ExportSelection {
  worldKeys: string[] | null
  playerAddresses: string[] | null
  playerKeys: string[] | null
}

/** The scene whose storage is exported. */
export interface ExportScene {
  worldName: string
  placeId: string
}

/** Result of opening an export: the gzipped stream, which concurrent export cap was reached, or how long the scene's cooldown still runs. */
export type OpenExportResult =
  | { kind: 'stream'; stream: Readable }
  | { kind: 'limit-reached'; scope: 'scene' | 'pod' }
  | { kind: 'cooldown'; retryAfterSeconds: number }

export interface IStorageExportComponent {
  /** Opens a gzipped JSON or CSV stream of the scene's selected storage, `limit-reached` at the scene's or pod's cap, or `cooldown` while the scene's last export started too recently. */
  openExport(scene: ExportScene, selection: ExportSelection, format: ExportFormat): OpenExportResult
}
