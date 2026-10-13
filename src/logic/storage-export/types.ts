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

/** Result of opening an export: the gzipped stream, or which concurrent export cap was reached. */
export type OpenExportResult = { kind: 'stream'; stream: Readable } | { kind: 'limit-reached'; scope: 'scene' | 'pod' }

export interface IStorageExportComponent {
  /** Opens a gzipped JSON or CSV stream of the scene's selected storage, or `limit-reached` at the scene's or pod's cap. */
  openExport(scene: ExportScene, selection: ExportSelection, format: ExportFormat): OpenExportResult
}
