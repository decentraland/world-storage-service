import type { ICacheStorageComponent } from '@dcl/core-commons'
import { createConfigMockedComponent } from '@dcl/core-commons'
import { InvalidRequestError } from '@dcl/http-commons'
import type { IPgComponent } from '@dcl/pg-component'
import { createPlacesComponent } from '../../../src/adapters/places'
import { PARCELS, PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import { createCacheMockedComponent, createLogsMockedComponent, createPgMockedComponent } from '../../mocks/components'
import type { IPlacesComponent } from '../../../src/adapters/places/types'
import type { SQLStatement } from 'sql-template-strings'

describe('PlacesComponent', () => {
  let config: ReturnType<typeof createConfigMockedComponent>
  let placesPg: jest.Mocked<IPgComponent>
  let cache: jest.Mocked<ICacheStorageComponent>
  let places: IPlacesComponent

  function mockRows(rows: Array<{ place_id: string }>): void {
    placesPg.query.mockResolvedValue({ rows, rowCount: rows.length } as never)
  }

  function lastQuery(): SQLStatement {
    return placesPg.query.mock.calls[placesPg.query.mock.calls.length - 1][0] as SQLStatement
  }

  beforeEach(async () => {
    config = createConfigMockedComponent({
      getNumber: jest.fn().mockResolvedValue(undefined)
    })
    placesPg = createPgMockedComponent()
    cache = createCacheMockedComponent()
    cache.get.mockResolvedValue(null)

    places = await createPlacesComponent({
      placesPg,
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
      mockRows([{ place_id: PLACE_IDS.DEFAULT }])
    })

    it('should query the view by world flag, lowercased world name and position', async () => {
      await places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.SCENE_A)
      const query = lastQuery()
      expect(query.text).toContain('world IS TRUE')
      expect(query.values).toEqual([WORLD_NAMES.DEFAULT.toLowerCase(), PARCELS.SCENE_A])
    })

    it('should lowercase a mixed-case world name before matching', async () => {
      await places.resolvePlaceId('MixedCase.DCL.eth', PARCELS.DEFAULT)
      expect(lastQuery().values).toEqual(['mixedcase.dcl.eth', PARCELS.DEFAULT])
    })

    it('should return the place ID from the view', async () => {
      const result = await places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.DEFAULT)
      expect(result).toBe(PLACE_IDS.DEFAULT)
    })

    it('should cache the result', async () => {
      await places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.DEFAULT)
      expect(cache.set).toHaveBeenCalledWith(`places:${WORLD_NAMES.DEFAULT}:${PARCELS.DEFAULT}`, PLACE_IDS.DEFAULT, 300)
    })
  })

  describe('when resolving a place ID for Genesis City', () => {
    beforeEach(() => {
      mockRows([{ place_id: PLACE_IDS.GENESIS_CITY }])
    })

    it('should query the view by position only', async () => {
      await places.resolvePlaceId('main', PARCELS.GENESIS_CITY)
      const query = lastQuery()
      expect(query.text).toContain('world IS FALSE')
      expect(query.values).toEqual([PARCELS.GENESIS_CITY])
    })

    it('should treat non-`.eth` realm names as Genesis City (e.g. `artemis` on zone)', async () => {
      await places.resolvePlaceId('artemis', '-125,-96')
      const query = lastQuery()
      expect(query.text).toContain('world IS FALSE')
      expect(query.values).toEqual(['-125,-96'])
    })

    it('should return the place ID from the view', async () => {
      const result = await places.resolvePlaceId('main', PARCELS.GENESIS_CITY)
      expect(result).toBe(PLACE_IDS.GENESIS_CITY)
    })
  })

  describe('when the place ID is already cached', () => {
    beforeEach(() => {
      cache.get.mockResolvedValueOnce(PLACE_IDS.DEFAULT)
    })

    it('should return the cached value without querying the view', async () => {
      const result = await places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.DEFAULT)
      expect(result).toBe(PLACE_IDS.DEFAULT)
      expect(placesPg.query).not.toHaveBeenCalled()
    })
  })

  describe('when the view returns no rows', () => {
    beforeEach(() => {
      mockRows([])
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.DEFAULT)).rejects.toThrow(InvalidRequestError)
    })

    it('should include the world name and parcel in the error message', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.DEFAULT)).rejects.toThrow(
        /Scene not found in Places/
      )
    })

    it('should not cache a miss', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.DEFAULT)).rejects.toThrow(InvalidRequestError)
      expect(cache.set).not.toHaveBeenCalled()
    })
  })

  describe('when the view returns a row without an id', () => {
    beforeEach(() => {
      placesPg.query.mockResolvedValue({ rows: [{ other: 'value' }], rowCount: 1 } as never)
    })

    it('should throw an InvalidRequestError', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.DEFAULT)).rejects.toThrow(InvalidRequestError)
    })
  })

  describe('when the query fails', () => {
    beforeEach(() => {
      placesPg.query.mockRejectedValueOnce(new Error('connection refused'))
    })

    it('should propagate the error', async () => {
      await expect(places.resolvePlaceId(WORLD_NAMES.DEFAULT, PARCELS.DEFAULT)).rejects.toThrow('connection refused')
    })
  })
})
