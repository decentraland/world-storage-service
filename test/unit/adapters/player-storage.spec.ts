import type { ICacheStorageComponent } from '@dcl/core-commons'
import { createConfigMockedComponent } from '@dcl/core-commons'
import type { IPgComponent } from '@dcl/pg-component'
import { createPlayerStorageComponent } from '../../../src/adapters/player-storage'
import { ADDRESSES, PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import { createCacheMockedComponent, createLogsMockedComponent, createPgMockedComponent } from '../../mocks/components'
import type { IPlayerStorageComponent } from '../../../src/adapters/player-storage/types'

describe('PlayerStorageComponent', () => {
  let pg: jest.Mocked<IPgComponent>
  let storageCache: jest.Mocked<ICacheStorageComponent>
  let config: ReturnType<typeof createConfigMockedComponent>
  let playerStorage: IPlayerStorageComponent
  let worldName: string
  let placeId: string
  let playerAddress: string
  let key: string
  let storedValue: string
  let cacheKey: string

  beforeEach(async () => {
    worldName = WORLD_NAMES.DEFAULT
    placeId = PLACE_IDS.DEFAULT
    playerAddress = ADDRESSES.PLAYER
    key = 'my-key'
    storedValue = 'stored-value'
    cacheKey = `player-storage:value:${worldName}:${placeId}:${playerAddress}:${key}`

    pg = createPgMockedComponent()
    storageCache = createCacheMockedComponent()
    storageCache.get.mockResolvedValue(null)
    storageCache.keys.mockResolvedValue([])

    config = createConfigMockedComponent({
      getString: jest.fn().mockResolvedValue(undefined),
      getNumber: jest.fn().mockResolvedValue(undefined)
    })

    playerStorage = await createPlayerStorageComponent({ pg, config, storageCache, logs: createLogsMockedComponent() })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getting a player storage value', () => {
    describe('and the value is not cached', () => {
      beforeEach(() => {
        storageCache.get.mockResolvedValueOnce(null)
        pg.query.mockResolvedValueOnce({ rows: [{ value: storedValue }] } as never)
      })

      it('should query the database once', async () => {
        await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(pg.query).toHaveBeenCalledTimes(1)
      })

      it('should return the value from the database', async () => {
        const result = await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(result).toEqual(storedValue)
      })

      it('should store the fetched value in the cache', async () => {
        await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(storageCache.set).toHaveBeenCalledWith(cacheKey, storedValue)
      })
    })

    describe('and the value is already cached', () => {
      beforeEach(() => {
        storageCache.get.mockResolvedValueOnce(storedValue)
      })

      it('should return the cached value', async () => {
        const result = await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(result).toEqual(storedValue)
      })

      it('should not query the database', async () => {
        await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(pg.query).not.toHaveBeenCalled()
      })
    })

    describe('and the value does not exist in the database', () => {
      beforeEach(() => {
        storageCache.get.mockResolvedValueOnce(null)
        pg.query.mockResolvedValueOnce({ rows: [] } as never)
      })

      it('should return null', async () => {
        const result = await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(result).toBeNull()
      })

      it('should not store anything in the cache', async () => {
        await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(storageCache.set).not.toHaveBeenCalled()
      })
    })

    describe('and the stored value is larger than the max cacheable size', () => {
      beforeEach(async () => {
        config = createConfigMockedComponent({
          getString: jest.fn().mockResolvedValue(undefined),
          getNumber: jest.fn().mockResolvedValue(5)
        })
        playerStorage = await createPlayerStorageComponent({
          pg,
          config,
          storageCache,
          logs: createLogsMockedComponent()
        })
        storageCache.get.mockResolvedValueOnce(null)
        pg.query.mockResolvedValueOnce({ rows: [{ value: storedValue }] } as never)
      })

      it('should return the value from the database', async () => {
        const result = await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(result).toEqual(storedValue)
      })

      it('should not store the value in the cache', async () => {
        await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(storageCache.set).not.toHaveBeenCalled()
      })
    })

    describe('and the cache is disabled', () => {
      beforeEach(async () => {
        config = createConfigMockedComponent({
          getString: jest.fn().mockResolvedValue('false'),
          getNumber: jest.fn().mockResolvedValue(undefined)
        })
        playerStorage = await createPlayerStorageComponent({
          pg,
          config,
          storageCache,
          logs: createLogsMockedComponent()
        })
        pg.query.mockResolvedValueOnce({ rows: [{ value: storedValue }] } as never)
      })

      it('should not read from the cache', async () => {
        await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(storageCache.get).not.toHaveBeenCalled()
      })

      it('should not write to the cache', async () => {
        await playerStorage.getValue(worldName, placeId, playerAddress, key)
        expect(storageCache.set).not.toHaveBeenCalled()
      })
    })
  })

  describe('when setting a player storage value', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [{ worldName, playerAddress, key, value: storedValue }] } as never)
    })

    it('should invalidate the cached value for the key', async () => {
      await playerStorage.setValue(worldName, placeId, playerAddress, key, storedValue)
      expect(storageCache.remove).toHaveBeenCalledWith(cacheKey)
    })
  })

  describe('when deleting a player storage value', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [] } as never)
    })

    it('should invalidate the cached value for the key', async () => {
      await playerStorage.deleteValue(worldName, placeId, playerAddress, key)
      expect(storageCache.remove).toHaveBeenCalledWith(cacheKey)
    })
  })

  describe('when deleting all values for a single player', () => {
    let firstKey: string
    let secondKey: string

    beforeEach(() => {
      firstKey = `player-storage:value:${worldName}:${placeId}:${playerAddress}:a`
      secondKey = `player-storage:value:${worldName}:${placeId}:${playerAddress}:b`
      pg.query.mockResolvedValueOnce({ rows: [] } as never)
      storageCache.keys.mockResolvedValueOnce([firstKey, secondKey])
    })

    it('should look up the cached keys for the player by prefix', async () => {
      await playerStorage.deleteAllForPlayer(worldName, placeId, playerAddress)
      expect(storageCache.keys).toHaveBeenCalledWith(`player-storage:value:${worldName}:${placeId}:${playerAddress}:*`)
    })

    it('should remove every cached key found for the player', async () => {
      await playerStorage.deleteAllForPlayer(worldName, placeId, playerAddress)
      expect(storageCache.remove).toHaveBeenCalledWith(firstKey)
      expect(storageCache.remove).toHaveBeenCalledWith(secondKey)
    })
  })

  describe('when deleting all player values for a scene', () => {
    let firstKey: string
    let secondKey: string

    beforeEach(() => {
      firstKey = `player-storage:value:${worldName}:${placeId}:${ADDRESSES.PLAYER}:a`
      secondKey = `player-storage:value:${worldName}:${placeId}:${ADDRESSES.OTHER}:b`
      pg.query.mockResolvedValueOnce({ rows: [] } as never)
      storageCache.keys.mockResolvedValueOnce([firstKey, secondKey])
    })

    it('should look up the cached keys for the scene by prefix', async () => {
      await playerStorage.deleteAll(worldName, placeId)
      expect(storageCache.keys).toHaveBeenCalledWith(`player-storage:value:${worldName}:${placeId}:*`)
    })

    it('should remove every cached key found for the scene', async () => {
      await playerStorage.deleteAll(worldName, placeId)
      expect(storageCache.remove).toHaveBeenCalledWith(firstKey)
      expect(storageCache.remove).toHaveBeenCalledWith(secondKey)
    })
  })

  describe('when listing player storage values', () => {
    // Rows as returned by `SELECT key, value::text` — each value is already JSON text.
    let rows: Array<{ key: string; value: string }>
    let dataText: string

    beforeEach(() => {
      rows = [
        { key: 'a', value: '"value-a"' },
        { key: 'b', value: '42' }
      ]
      dataText = '[{"key":"a","value":"value-a"},{"key":"b","value":42}]'
      pg.query.mockResolvedValueOnce({ rows } as never)
    })

    it('should return the page assembled as JSON array text', async () => {
      const result = await playerStorage.listValues(worldName, placeId, playerAddress, {
        limit: 10,
        offset: 0,
        prefix: undefined
      })
      expect(result).toBe(dataText)
    })
  })

  describe('when counting player storage keys', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [{ count: 7 }] } as never)
    })

    it('should return the count from the database', async () => {
      const result = await playerStorage.countKeys(worldName, placeId, playerAddress, { prefix: undefined })
      expect(result).toBe(7)
    })
  })

  describe('when listing players with stored values', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({
        rows: [{ player_address: ADDRESSES.PLAYER }, { player_address: ADDRESSES.OTHER }]
      } as never)
    })

    it('should return the distinct player addresses', async () => {
      const result = await playerStorage.listPlayers(worldName, placeId, { limit: 10, offset: 0 })
      expect(result).toEqual([ADDRESSES.PLAYER, ADDRESSES.OTHER])
    })
  })

  describe('when counting distinct players', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [{ count: 3 }] } as never)
    })

    it('should return the count from the database', async () => {
      const result = await playerStorage.countPlayers(worldName, placeId)
      expect(result).toBe(3)
    })
  })

  describe('when getting player storage size info', () => {
    describe('and a key is provided', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [{ existing_value_size: 5, total_size: 50 }] } as never)
      })

      it('should return the existing value size and total size', async () => {
        const result = await playerStorage.getSizeInfo(worldName, playerAddress, key)
        expect(result).toEqual({ existingValueSize: 5, totalSize: 50 })
      })
    })

    describe('and no key is provided', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [{ existing_value_size: 0, total_size: 120 }] } as never)
      })

      it('should return a zero existing value size and the total size', async () => {
        const result = await playerStorage.getSizeInfo(worldName, playerAddress)
        expect(result).toEqual({ existingValueSize: 0, totalSize: 120 })
      })
    })
  })

  describe('when the cache is disabled and a value is written', () => {
    let disabledPlayerStorage: IPlayerStorageComponent

    beforeEach(async () => {
      config = createConfigMockedComponent({
        getString: jest.fn().mockResolvedValue('false'),
        getNumber: jest.fn().mockResolvedValue(undefined)
      })
      disabledPlayerStorage = await createPlayerStorageComponent({
        pg,
        config,
        storageCache,
        logs: createLogsMockedComponent()
      })
      pg.query.mockResolvedValue({ rows: [] } as never)
    })

    it('should not invalidate the cache on setValue', async () => {
      await disabledPlayerStorage.setValue(worldName, placeId, playerAddress, key, '"v"')
      expect(storageCache.remove).not.toHaveBeenCalled()
      expect(storageCache.keys).not.toHaveBeenCalled()
    })

    it('should not invalidate the cache on deleteAllForPlayer', async () => {
      await disabledPlayerStorage.deleteAllForPlayer(worldName, placeId, playerAddress)
      expect(storageCache.remove).not.toHaveBeenCalled()
      expect(storageCache.keys).not.toHaveBeenCalled()
    })
  })
})
