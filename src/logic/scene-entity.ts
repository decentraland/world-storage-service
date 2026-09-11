import { extractLogsPermissions } from './logs-permissions'
import type { WorldScene } from '../adapters/worlds-content-server/types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Maps a scene entity to a `WorldScene`, or `null` when `id`/`base`/`parcels` are missing (caller decides skip vs fail). */
export function mapSceneEntity(entity: unknown): WorldScene | null {
  if (!isRecord(entity)) {
    return null
  }

  const metadata = isRecord(entity.metadata) ? entity.metadata : undefined
  const scene = isRecord(metadata?.scene) ? metadata.scene : undefined
  const display = isRecord(metadata?.display) ? metadata.display : undefined

  const sceneId = entity.id
  const base = scene?.base
  const parcels = scene?.parcels
  const title = display?.title

  if (typeof sceneId !== 'string' || typeof base !== 'string' || !Array.isArray(parcels)) {
    return null
  }

  return {
    sceneId,
    base,
    parcels: parcels.filter((parcel): parcel is string => typeof parcel === 'string'),
    title: typeof title === 'string' ? title : null,
    logsPermissions: extractLogsPermissions(metadata)
  }
}
