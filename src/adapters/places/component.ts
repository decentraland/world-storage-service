import type { IConfigComponent, IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'
import type { ICacheStorageComponent } from '@dcl/core-commons'
import { InvalidRequestError } from '@dcl/http-commons'
import { errorMessageOrDefault } from '../../utils/errors'
import type { IPlacesComponent } from './types'

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
export function createPlacesComponent(components: {
  fetcher: IFetchComponent
  config: IConfigComponent
  cache: ICacheStorageComponent
  logs: ILoggerComponent
}): IPlacesComponent {
  const { fetcher, config, cache, logs } = components
  const logger = logs.getLogger('places')

  return {
    async resolvePlaceId(worldName: string, parcel: string): Promise<string> {
      const cacheTtlSeconds = (await config.getNumber('PLACES_CACHE_TTL_SECONDS')) ?? 300
      const cacheKey = `places:${worldName}:${parcel}`

      const cached = await cache.get<string>(cacheKey)
      if (cached) {
        logger.debug('Place ID resolved from cache', { worldName, parcel, placeId: cached })
        return cached
      }

      const placesUrl = await config.requireString('PLACES_URL')
      const baseUrl = `${placesUrl.replace(/\/$/, '')}/api/places`

      let url: string
      if (worldName === 'main') {
        url = `${baseUrl}?positions=${parcel}`
      } else {
        url = `${baseUrl}?names=${encodeURIComponent(worldName)}&positions=${parcel}`
      }

      logger.debug('Resolving place ID from Places API', { worldName, parcel, url })

      try {
        const response = await fetcher.fetch(url)

        if (!response.ok) {
          throw new Error(`Places API returned HTTP ${response.status}`)
        }

        const body: PlacesApiResponse = await response.json()

        if (!body.data || body.data.length === 0) {
          throw new InvalidRequestError(`Scene not found in Places API for world "${worldName}" at parcel "${parcel}"`)
        }

        const placeId = body.data[0].id

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
