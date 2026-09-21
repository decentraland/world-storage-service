import { extractLogsPermissions } from './logs-permissions'
import type { WorldScene } from '../adapters/worlds-content-server/types'

const MAX_TITLE_LENGTH = 255

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * @param values - Candidate values, in precedence order.
 * @returns The first non-empty string, or `undefined` when there is none.
 */
export function pickString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0)
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

/**
 * Maps a scene entity to a `WorldScene`, or `null` when `base`/`parcels` are missing.
 *
 * @param entity - Untrusted scene entity payload.
 * @param sceneId - The entity id, resolved by the calling adapter from its own payload.
 */
export function mapSceneEntity(entity: unknown, sceneId: string): WorldScene | null {
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
