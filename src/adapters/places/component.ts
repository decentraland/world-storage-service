import { InvalidRequestError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../utils/errors'
import { UPSTREAM_FETCH_OPTIONS, discardResponseBody } from '../../utils/upstreamFetch'
import { isWorldName } from '../../utils/worldName'
import type { IPlacesComponent } from './types'
import type { AppComponents } from '../../types'

interface PlacesApiResponse {
  ok: boolean
  total: number
  data: Array<{ id: string }>
}

/**
 * Creates the Places API adapter that resolves place IDs from world name and parcel coordinates.
 *
 * Resolution logic:
 * - Genesis City (world_name = "main"): GET /api/places?positions=<parcel>
 * - Worlds: GET /api/places?names=<worldName>&positions=<parcel>
 *
 * Results are cached using an in-memory LRU cache with a configurable TTL
 * from `PLACES_CACHE_TTL_SECONDS` (default: 300 seconds).
 *
 * @param components - Required components: fetcher, config, cache, logs
 * @returns IPlacesComponent implementation
 */
export async function createPlacesComponent(
  components: Pick<AppComponents, 'fetcher' | 'config' | 'cache' | 'logs'>
): Promise<IPlacesComponent> {
  const { fetcher, config, cache, logs } = components
  const logger = logs.getLogger('places')
  const placesUrl = await config.requireString('PLACES_URL')

  function buildPlacesUrl(worldName: string, parcel: string): string {
    const baseUrl = `${placesUrl.replace(/\/$/, '')}/api/places`
    const encodedParcel = encodeURIComponent(parcel)
    // Only `.eth` realms are worlds. Any other realmName (e.g. `main` in prod,
    // `artemis` in zone) is a Genesis City realm — those scenes are identified
    // by parcel position alone.
    const isWorld = isWorldName(worldName)

    if (!isWorld) {
      return `${baseUrl}?positions=${encodedParcel}`
    }

    return `${baseUrl}?names=${encodeURIComponent(worldName)}&positions=${encodedParcel}`
  }

  // Validates the upstream payload shape (rather than trusting a bare cast) and returns the
  // resolved place id. Mirrors the worlds-content-server adapter's shape-assertion approach.
  function extractPlaceId(body: unknown, worldName: string, parcel: string): string {
    const data = (body as PlacesApiResponse | null)?.data

    // A missing or empty result means the scene isn't registered in Places.
    if (data === undefined || data === null || (Array.isArray(data) && data.length === 0)) {
      throw new InvalidRequestError(`Scene not found in Places API for world "${worldName}" at parcel "${parcel}"`)
    }

    // Anything present that isn't an array of entries is an upstream contract violation.
    if (!Array.isArray(data)) {
      throw new Error(`Places API returned an unexpected payload for world "${worldName}" at parcel "${parcel}"`)
    }

    const placeId = data[0]?.id
    // Guard the upstream contract: an entry without an id would flow into `::uuid` SQL
    // casts (and the cache) as `undefined`, producing 500s on every request for the scene.
    if (typeof placeId !== 'string' || placeId.length === 0) {
      throw new Error(`Places API returned a place without an id for world "${worldName}" at parcel "${parcel}"`)
    }

    return placeId
  }

  async function fetchPlaceId(worldName: string, parcel: string): Promise<string> {
    const url = buildPlacesUrl(worldName, parcel)

    logger.debug('Resolving place ID from Places API', { worldName, parcel, url })

    const response = await fetcher.fetch(url, UPSTREAM_FETCH_OPTIONS)

    if (!response.ok) {
      await discardResponseBody(response)
      throw new Error(`Places API returned HTTP ${response.status}`)
    }

    const body: unknown = await response.json()

    return extractPlaceId(body, worldName, parcel)
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
        const placeId = await fetchPlaceId(worldName, parcel)
        const cacheTtlSeconds = (await config.getNumber('PLACES_CACHE_TTL_SECONDS')) ?? 300

        logger.debug('Place ID resolved successfully', { worldName, parcel, placeId })
        await cache.set(cacheKey, placeId, cacheTtlSeconds)

        return placeId
      } catch (error) {
        if (error instanceof InvalidRequestError) {
          throw error
        }

        logger.error('Failed to resolve place ID from Places API', {
          worldName,
          parcel,
          error: errorMessageOrDefault(error)
        })
        throw error
      }
    }
  }
}
