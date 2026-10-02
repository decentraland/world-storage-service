import { SQL } from 'sql-template-strings'
import { InvalidRequestError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../utils/errors'
import { isWorldName } from '../../utils/worldName'
import type { IPlacesComponent } from './types'
import type { AppComponents } from '../../types'

/**
 * Creates the Places adapter that resolves place IDs from world name and parcel coordinates.
 *
 * Resolution reads the Places-owned read-only `place_scene_resolution` view over the VPC:
 * - Genesis City (world_name = "main" and other non-world realms): matched by position.
 * - Worlds (*.eth): matched by lowercased world name and position.
 *
 * The view exposes only the id and resolution keys and includes opt-out scenes, so a scene hidden
 * from the public Places listing still resolves. Results are cached using an in-memory cache with a
 * configurable TTL from `PLACES_CACHE_TTL_SECONDS` (default: 300 seconds).
 *
 * @param components - Required components: placesPg (read-only Places DB), config, cache, logs
 * @returns IPlacesComponent implementation
 */
export async function createPlacesComponent(
  components: Pick<AppComponents, 'placesPg' | 'config' | 'cache' | 'logs'>
): Promise<IPlacesComponent> {
  const { placesPg, config, cache, logs } = components
  const logger = logs.getLogger('places')

  async function queryPlaceId(worldName: string, parcel: string): Promise<string> {
    const query = isWorldName(worldName)
      ? SQL`SELECT place_id FROM place_scene_resolution WHERE world IS TRUE AND world_name = ${worldName.toLowerCase()} AND position = ${parcel} LIMIT 1`
      : SQL`SELECT place_id FROM place_scene_resolution WHERE world IS FALSE AND position = ${parcel} LIMIT 1`

    const result = await placesPg.query<{ place_id: string }>(query)
    const placeId = result.rows[0]?.place_id

    if (typeof placeId !== 'string' || placeId.length === 0) {
      throw new InvalidRequestError(`Scene not found in Places for world "${worldName}" at parcel "${parcel}"`)
    }

    return placeId
  }

  return {
    async resolvePlaceId(worldName: string, parcel: string): Promise<string> {
      const cacheKey = `places:${worldName}:${parcel}`

      const cached = await cache.get<string>(cacheKey)
      if (cached) {
        logger.debug('Place ID resolved from cache', { worldName, parcel, placeId: cached })
        return cached
      }

      try {
        const placeId = await queryPlaceId(worldName, parcel)
        const cacheTtlSeconds = (await config.getNumber('PLACES_CACHE_TTL_SECONDS')) ?? 300

        logger.debug('Place ID resolved successfully', { worldName, parcel, placeId })
        await cache.set(cacheKey, placeId, cacheTtlSeconds)

        return placeId
      } catch (error) {
        if (error instanceof InvalidRequestError) {
          throw error
        }

        logger.error('Failed to resolve place ID from Places DB', {
          worldName,
          parcel,
          error: errorMessageOrDefault(error)
        })
        throw error
      }
    }
  }
}
