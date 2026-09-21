import { isRecord } from '../../utils/typeGuards'
import type { ISceneEntityComponent } from './types'
import type { WorldScene } from '../../adapters/worlds-content-server/types'

const MAX_TITLE_LENGTH = 255

function isControlCodePoint(codePoint: number): boolean {
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)
}

function filterStringEntries(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/**
 * Creates the scene entity component: the single place that reads untrusted scene entity
 * payloads, whatever produced them — a content server response, a worlds deployment event,
 * or a catalyst deployment event on the SNS bus.
 *
 * Every field is treated as untrusted: shapes are checked with runtime guards, the title is
 * bounded and stripped of control characters, and a payload that cannot be mapped yields
 * `null` for the caller to discard rather than throwing.
 *
 * @returns Promise resolving to ISceneEntityComponent implementation
 */
export async function createSceneEntityComponent(): Promise<ISceneEntityComponent> {
  function normalizeTitle(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null
    }

    let cleaned = ''
    for (const char of value) {
      if (!isControlCodePoint(char.codePointAt(0) ?? 0)) {
        cleaned += char
      }
    }

    cleaned = cleaned.trim()
    return cleaned.length === 0 ? null : cleaned.slice(0, MAX_TITLE_LENGTH)
  }

  function extractLogsPermissions(metadata: unknown): string[] {
    return filterStringEntries(isRecord(metadata) ? metadata.logsPermissions : undefined).map(entry =>
      entry.toLowerCase()
    )
  }

  return {
    normalizeTitle,
    extractLogsPermissions,

    mapSceneEntity: (entity: unknown, sceneId: string): WorldScene | null => {
      if (!isRecord(entity)) {
        return null
      }

      const metadata = isRecord(entity.metadata) ? entity.metadata : undefined
      const scene = isRecord(metadata?.scene) ? metadata.scene : undefined
      const display = isRecord(metadata?.display) ? metadata.display : undefined

      const base = scene?.base
      const parcels = scene?.parcels

      if (typeof base !== 'string' || !Array.isArray(parcels)) {
        return null
      }

      return {
        sceneId,
        base,
        parcels: parcels.filter((parcel): parcel is string => typeof parcel === 'string'),
        title: normalizeTitle(display?.title),
        deployedAt: typeof entity.timestamp === 'number' ? entity.timestamp : 0,
        logsPermissions: extractLogsPermissions(metadata)
      }
    }
  }
}
