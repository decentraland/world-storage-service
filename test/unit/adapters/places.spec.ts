import type { Response } from '@well-known-components/interfaces'
import type { ICacheStorageComponent } from '@dcl/core-commons'
import { createConfigMockedComponent, createFetchMockedComponent } from '@dcl/core-commons'
import { InvalidRequestError } from '@dcl/http-commons'
import { createPlacesComponent } from '../../../src/adapters/places'
import { PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import { createCacheMockedComponent, createLogsMockedComponent } from '../../mocks/components'
import type { IPlacesComponent } from '../../../src/adapters/places/types'

describe('PlacesComponent', () => {
  const placesUrl = 'https://places.decentraland.org'
  let config: ReturnType<typeof createConfigMockedComponent>
  let fetcher: ReturnType<typeof createFetchMockedComponent>
  let cache: jest.Mocked<ICacheStorageComponent>
  let places: IPlacesComponent

  function mockResponse(response: Partial<Response>): Response {
    return response as Response
  }

  beforeEach(async () => {
    config = createConfigMockedComponent({
      getNumber: jest.fn().mockResolvedValue(undefined),
      requireString: jest.fn().mockResolvedValue(placesUrl)
    })
    fetcher = createFetchMockedComponent()
    cache = createCacheMockedComponent()

    places = await createPlacesComponent({
      fetcher,
      config,
      cache,
      logs: createLogsMockedComponent()
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when resolving a place ID for a world', () => {
    beforeEach(() => {
      fetcher.fetch.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: jest.fn().mockResolvedValue({
            ok: true,
            total: 1,
            data: [{ id: PLACE_IDS.DEFAULT }]
          })
        })
      )
    })

    it('should call the Places API with names and positions parameters', async () => {
      await places.resolvePlaceId(WORLD_NAMES.DEFAULT, '0,0')
      expect(fetcher.fetch).toHaveBeenCalledWith(
        `${placesUrl}/api/places?names=${encodeURIComponent(WORLD_NAMES.DEFAULT)}&positions=${encodeURIComponent('0,0')}`
      )
    })

    it('should return the place ID from the response', async () => {
      const result = await places.resolvePlaceId(WORLD_NAMES.DEFAULT, '0,0')
      expect(result).toBe(PLACE_IDS.DEFAULT)
    })

    it('should cache the result', async () => {
      await places.resolvePlaceId(WORLD_NAMES.DEFAULT, '0,0')
      expect(cache.set).toHaveBeenCalledWith(`places:${WORLD_NAMES.DEFAULT}:0,0`, PLACE_IDS.DEFAULT, 300)
    })
  })

  describe('when resolving a place ID for Genesis City', () => {
    beforeEach(() => {
      fetcher.fetch.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: jest.fn().mockResolvedValue({
            ok: true,
            total: 1,
            data: [{ id: PLACE_IDS.GENESIS_CITY }]
          })
        })
      )
    })

    it('should call the Places API with positions only', async () => {
      await places.resolvePlaceId('main', '52,-10')
      expect(fetcher.fetch).toHaveBeenCalledWith(`${placesUrl}/api/places?positions=${encodeURIComponent('52,-10')}`)
    })

    it('should return the place ID from the response', async () => {
      const result = await places.resolvePlaceId('main', '52,-10')
      expect(result).toBe(PLACE_IDS.GENESIS_CITY)
    })
  })

  describe('when the place ID is already cached', () => {
    beforeEach(() => {
      cache.get.mockResolvedValueOnce(PLACE_IDS.DEFAULT)
    })

    it('should return the cached value without calling the API', async () => {
      const result = await places.resolvePlaceId(WORLD_NAMES.DEFAULT, '0,0')
      expect(result).toBe(PLACE_IDS.DEFAULT)
      expect(fetcher.fetch).not.toHaveBeenCalled()
    })
  })

  describe('when the Places API returns no data', () => {
    beforeEach(() => {
      fetcher.fetch.mockResolvedValue(
        mockResponse({
          ok: true,
          json: jest.fn().mockResolvedValue({
            ok: true,
            total: 0,
            data: []
          })
        })
      )
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, '0,0')).rejects.toThrow(InvalidRequestError)
    })

    it('should include the world name and parcel in the error message', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, '0,0')).rejects.toThrow(/Scene not found in Places API/)
    })
  })

  describe('when the Places API returns an HTTP error', () => {
    beforeEach(() => {
      fetcher.fetch.mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 500
        })
      )
    })

    it('should throw an error', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, '0,0')).rejects.toThrow('Places API returned HTTP 500')
    })
  })

  describe('when the fetch fails with a network error', () => {
    beforeEach(() => {
      fetcher.fetch.mockRejectedValueOnce(new Error('Network error'))
    })

    it('should propagate the error', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, '0,0')).rejects.toThrow('Network error')
    })
  })
})
