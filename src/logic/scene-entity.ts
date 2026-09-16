import { extractLogsPermissions } from './logs-permissions'
import type { WorldScene } from '../adapters/worlds-content-server/types'

const MAX_TITLE_LENGTH = 255

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isControlCodePoint(codePoint: number): boolean {
  return codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)
}

/** Coerces an untrusted scene title to bounded, control-character-free plain text, or `null`. */
export function normalizeTitle(value: unknown): string | null {
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

/** Maps a scene entity to a `WorldScene`, or `null` when `base`/`parcels` are missing; `id` falls back to `fallbackId` (the content-addressed file omits its own id). */
export function mapSceneEntity(entity: unknown, fallbackId?: string): WorldScene | null {
  if (!isRecord(entity)) {
    return null
  }

  const metadata = isRecord(entity.metadata) ? entity.metadata : undefined
  const scene = isRecord(metadata?.scene) ? metadata.scene : undefined
  const display = isRecord(metadata?.display) ? metadata.display : undefined

  const sceneId = typeof entity.id === 'string' ? entity.id : fallbackId
  const base = scene?.base
  const parcels = scene?.parcels

  if (typeof sceneId !== 'string' || typeof base !== 'string' || !Array.isArray(parcels)) {
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
