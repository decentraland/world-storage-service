import type { ICacheStorageComponent } from '@dcl/core-commons'
import { createConfigMockedComponent } from '@dcl/core-commons'
import type { IPgComponent } from '@dcl/pg-component'
import { createWorldStorageComponent } from '../../../src/adapters/world-storage'
import { PLACE_IDS, WORLD_NAMES } from '../../fixtures'
import { createCacheMockedComponent, createLogsMockedComponent, createPgMockedComponent } from '../../mocks/components'
import type { IWorldStorageComponent } from '../../../src/adapters/world-storage/types'

describe('WorldStorageComponent', () => {
  let pg: jest.Mocked<IPgComponent>
  let storageCache: jest.Mocked<ICacheStorageComponent>
  let config: ReturnType<typeof createConfigMockedComponent>
  let worldStorage: IWorldStorageComponent
  let worldName: string
  let placeId: string
  let key: string
  let storedValue: string
  let cacheKey: string

  beforeEach(async () => {
    worldName = WORLD_NAMES.DEFAULT
    placeId = PLACE_IDS.DEFAULT
    key = 'my-key'
    storedValue = 'stored-value'
    cacheKey = `world-storage:value:${worldName}:${placeId}:${key}`

    pg = createPgMockedComponent()
    storageCache = createCacheMockedComponent()
    storageCache.get.mockResolvedValue(null)
    storageCache.keys.mockResolvedValue([])

    config = createConfigMockedComponent({
      getString: jest.fn().mockResolvedValue(undefined),
      getNumber: jest.fn().mockResolvedValue(undefined)
    })

    worldStorage = await createWorldStorageComponent({ pg, config, storageCache, logs: createLogsMockedComponent() })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when getting a world storage value', () => {
    describe('and the value is not cached', () => {
      beforeEach(() => {
        storageCache.get.mockResolvedValueOnce(null)
        pg.query.mockResolvedValueOnce({ rows: [{ value: storedValue }] } as never)
      })

      it('should query the database once', async () => {
        await worldStorage.getValue(worldName, placeId, key)
        expect(pg.query).toHaveBeenCalledTimes(1)
      })

      it('should return the value from the database', async () => {
        const result = await worldStorage.getValue(worldName, placeId, key)
        expect(result).toEqual(storedValue)
      })

      it('should store the fetched value in the cache', async () => {
        await worldStorage.getValue(worldName, placeId, key)
        expect(storageCache.set).toHaveBeenCalledWith(cacheKey, storedValue)
      })
    })

    describe('and the value is already cached', () => {
      beforeEach(() => {
        storageCache.get.mockResolvedValueOnce(storedValue)
      })

      it('should return the cached value', async () => {
        const result = await worldStorage.getValue(worldName, placeId, key)
        expect(result).toEqual(storedValue)
      })

      it('should not query the database', async () => {
        await worldStorage.getValue(worldName, placeId, key)
        expect(pg.query).not.toHaveBeenCalled()
      })
    })

    describe('and the value does not exist in the database', () => {
      beforeEach(() => {
        storageCache.get.mockResolvedValueOnce(null)
        pg.query.mockResolvedValueOnce({ rows: [] } as never)
      })

      it('should return null', async () => {
        const result = await worldStorage.getValue(worldName, placeId, key)
        expect(result).toBeNull()
      })

      it('should not store anything in the cache', async () => {
        await worldStorage.getValue(worldName, placeId, key)
        expect(storageCache.set).not.toHaveBeenCalled()
      })
    })

    describe('and the stored value is larger than the max cacheable size', () => {
      beforeEach(async () => {
        config = createConfigMockedComponent({
          getString: jest.fn().mockResolvedValue(undefined),
          getNumber: jest.fn().mockResolvedValue(5)
        })
        worldStorage = await createWorldStorageComponent({
          pg,
          config,
          storageCache,
          logs: createLogsMockedComponent()
        })
        storageCache.get.mockResolvedValueOnce(null)
        pg.query.mockResolvedValueOnce({ rows: [{ value: storedValue }] } as never)
      })

      it('should return the value from the database', async () => {
        const result = await worldStorage.getValue(worldName, placeId, key)
        expect(result).toEqual(storedValue)
      })

      it('should not store the value in the cache', async () => {
        await worldStorage.getValue(worldName, placeId, key)
        expect(storageCache.set).not.toHaveBeenCalled()
      })
    })

    describe('and the cache is disabled', () => {
      beforeEach(async () => {
        config = createConfigMockedComponent({
          getString: jest.fn().mockResolvedValue('false'),
          getNumber: jest.fn().mockResolvedValue(undefined)
        })
        worldStorage = await createWorldStorageComponent({
          pg,
          config,
          storageCache,
          logs: createLogsMockedComponent()
        })
        pg.query.mockResolvedValueOnce({ rows: [{ value: storedValue }] } as never)
      })

      it('should not read from the cache', async () => {
        await worldStorage.getValue(worldName, placeId, key)
        expect(storageCache.get).not.toHaveBeenCalled()
      })

      it('should not write to the cache', async () => {
        await worldStorage.getValue(worldName, placeId, key)
        expect(storageCache.set).not.toHaveBeenCalled()
      })
    })
  })

  describe('when setting a world storage value', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [{ worldName, key, value: storedValue }] } as never)
    })

    it('should invalidate the cached value for the key', async () => {
      await worldStorage.setValue(worldName, placeId, key, storedValue)
      expect(storageCache.remove).toHaveBeenCalledWith(cacheKey)
    })

    it("should invalidate the scene's cached listing page", async () => {
      await worldStorage.setValue(worldName, placeId, key, storedValue)
      expect(storageCache.remove).toHaveBeenCalledWith(`world-storage:list:${worldName}:${placeId}`)
    })

    it("should invalidate the scene's cached total count", async () => {
      await worldStorage.setValue(worldName, placeId, key, storedValue)
      expect(storageCache.remove).toHaveBeenCalledWith(`world-storage:count:${worldName}:${placeId}`)
    })
  })

  describe('when deleting a world storage value', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [] } as never)
    })

    it('should invalidate the cached value for the key', async () => {
      await worldStorage.deleteValue(worldName, placeId, key)
      expect(storageCache.remove).toHaveBeenCalledWith(cacheKey)
    })

    it("should invalidate the scene's cached listing page", async () => {
      await worldStorage.deleteValue(worldName, placeId, key)
      expect(storageCache.remove).toHaveBeenCalledWith(`world-storage:list:${worldName}:${placeId}`)
    })

    it("should invalidate the scene's cached total count", async () => {
      await worldStorage.deleteValue(worldName, placeId, key)
      expect(storageCache.remove).toHaveBeenCalledWith(`world-storage:count:${worldName}:${placeId}`)
    })
  })

  describe('when deleting all world storage values for a scene', () => {
    let firstKey: string
    let secondKey: string

    beforeEach(() => {
      firstKey = `world-storage:value:${worldName}:${placeId}:a`
      secondKey = `world-storage:value:${worldName}:${placeId}:b`
      pg.query.mockResolvedValueOnce({ rows: [] } as never)
      storageCache.keys.mockResolvedValueOnce([firstKey, secondKey])
    })

    it('should look up the cached single values for the scene by prefix', async () => {
      await worldStorage.deleteAll(worldName, placeId)
      expect(storageCache.keys).toHaveBeenCalledWith(`world-storage:value:${worldName}:${placeId}:*`)
    })

    it('should remove every cached single value found for the scene', async () => {
      await worldStorage.deleteAll(worldName, placeId)
      expect(storageCache.remove).toHaveBeenCalledWith(firstKey)
      expect(storageCache.remove).toHaveBeenCalledWith(secondKey)
    })

    it("should invalidate the scene's cached listing page", async () => {
      await worldStorage.deleteAll(worldName, placeId)
      expect(storageCache.remove).toHaveBeenCalledWith(`world-storage:list:${worldName}:${placeId}`)
    })

    it("should invalidate the scene's cached total count", async () => {
      await worldStorage.deleteAll(worldName, placeId)
      expect(storageCache.remove).toHaveBeenCalledWith(`world-storage:count:${worldName}:${placeId}`)
    })
  })

  describe('when listing world storage values', () => {
    let listCacheKey: string
    // Rows as returned by `SELECT key, value::text` — each value is already JSON text.
    let rows: Array<{ key: string; value: string }>
    let dataText: string

    beforeEach(() => {
      listCacheKey = `world-storage:list:${worldName}:${placeId}`
      rows = [
        { key: 'a', value: '"value-a"' },
        { key: 'b', value: '42' }
      ]
      dataText = '[{"key":"a","value":"value-a"},{"key":"b","value":42}]'
    })

    describe('and the request is the default listing (first page, default size, no prefix)', () => {
      let defaultOptions: { limit: number; offset: number; prefix: string | undefined }

      beforeEach(() => {
        defaultOptions = { limit: 100, offset: 0, prefix: undefined }
      })

      describe('and the page is not cached', () => {
        beforeEach(() => {
          storageCache.get.mockResolvedValueOnce(null)
          pg.query.mockResolvedValueOnce({ rows } as never)
        })

        it('should query the database once', async () => {
          await worldStorage.listValues(worldName, placeId, defaultOptions)
          expect(pg.query).toHaveBeenCalledTimes(1)
        })

        it('should return the page assembled as JSON array text', async () => {
          const result = await worldStorage.listValues(worldName, placeId, defaultOptions)
          expect(result).toBe(dataText)
        })

        it('should store the assembled page text in the cache under the scene key', async () => {
          await worldStorage.listValues(worldName, placeId, defaultOptions)
          expect(storageCache.set).toHaveBeenCalledWith(listCacheKey, dataText)
        })
      })

      describe('and the page is empty', () => {
        beforeEach(() => {
          storageCache.get.mockResolvedValueOnce(null)
          pg.query.mockResolvedValueOnce({ rows: [] } as never)
        })

        it('should return an empty JSON array text', async () => {
          const result = await worldStorage.listValues(worldName, placeId, defaultOptions)
          expect(result).toBe('[]')
        })
      })

      describe('and the page is already cached', () => {
        beforeEach(() => {
          storageCache.get.mockResolvedValueOnce(dataText)
        })

        it('should return the cached page text', async () => {
          const result = await worldStorage.listValues(worldName, placeId, defaultOptions)
          expect(result).toBe(dataText)
        })

        it('should not query the database', async () => {
          await worldStorage.listValues(worldName, placeId, defaultOptions)
          expect(pg.query).not.toHaveBeenCalled()
        })
      })

      describe('and the page is larger than the max cacheable list size', () => {
        beforeEach(async () => {
          config = createConfigMockedComponent({
            getString: jest.fn().mockResolvedValue(undefined),
            getNumber: jest.fn().mockResolvedValue(5)
          })
          worldStorage = await createWorldStorageComponent({
            pg,
            config,
            storageCache,
            logs: createLogsMockedComponent()
          })
          storageCache.get.mockResolvedValueOnce(null)
          pg.query.mockResolvedValueOnce({ rows } as never)
        })

        it('should return the assembled page text from the database', async () => {
          const result = await worldStorage.listValues(worldName, placeId, defaultOptions)
          expect(result).toBe(dataText)
        })

        it('should not store the page in the cache', async () => {
          await worldStorage.listValues(worldName, placeId, defaultOptions)
          expect(storageCache.set).not.toHaveBeenCalled()
        })
      })
    })

    describe('and the request is not the default listing', () => {
      beforeEach(() => {
        pg.query.mockResolvedValue({ rows } as never)
      })

      it('should not read from the cache when a prefix is provided', async () => {
        await worldStorage.listValues(worldName, placeId, { limit: 100, offset: 0, prefix: 'foo' })
        expect(storageCache.get).not.toHaveBeenCalled()
      })

      it('should not read from the cache when the offset is not the first page', async () => {
        await worldStorage.listValues(worldName, placeId, { limit: 100, offset: 100, prefix: undefined })
        expect(storageCache.get).not.toHaveBeenCalled()
      })

      it('should not read from the cache when the limit is not the default', async () => {
        await worldStorage.listValues(worldName, placeId, { limit: 10, offset: 0, prefix: undefined })
        expect(storageCache.get).not.toHaveBeenCalled()
      })

      it('should not write to the cache', async () => {
        await worldStorage.listValues(worldName, placeId, { limit: 10, offset: 0, prefix: undefined })
        expect(storageCache.set).not.toHaveBeenCalled()
      })

      it('should still return the assembled page text', async () => {
        const result = await worldStorage.listValues(worldName, placeId, { limit: 10, offset: 0, prefix: undefined })
        expect(result).toBe(dataText)
      })
    })
  })

  describe('when counting world storage keys', () => {
    let countCacheKey: string

    beforeEach(() => {
      countCacheKey = `world-storage:count:${worldName}:${placeId}`
    })

    describe('and no prefix is provided', () => {
      describe('and the count is not cached', () => {
        beforeEach(() => {
          storageCache.get.mockResolvedValueOnce(null)
          pg.query.mockResolvedValueOnce({ rows: [{ count: 3 }] } as never)
        })

        it('should query the database once', async () => {
          await worldStorage.countKeys(worldName, placeId, { prefix: undefined })
          expect(pg.query).toHaveBeenCalledTimes(1)
        })

        it('should return the count from the database', async () => {
          const result = await worldStorage.countKeys(worldName, placeId, { prefix: undefined })
          expect(result).toBe(3)
        })

        it('should store the count in the cache', async () => {
          await worldStorage.countKeys(worldName, placeId, { prefix: undefined })
          expect(storageCache.set).toHaveBeenCalledWith(countCacheKey, 3)
        })
      })

      describe('and the count is already cached', () => {
        beforeEach(() => {
          storageCache.get.mockResolvedValueOnce(5)
        })

        it('should return the cached count', async () => {
          const result = await worldStorage.countKeys(worldName, placeId, { prefix: undefined })
          expect(result).toBe(5)
        })

        it('should not query the database', async () => {
          await worldStorage.countKeys(worldName, placeId, { prefix: undefined })
          expect(pg.query).not.toHaveBeenCalled()
        })
      })
    })

    describe('and a prefix is provided', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [{ count: 2 }] } as never)
      })

      it('should not read from the cache', async () => {
        await worldStorage.countKeys(worldName, placeId, { prefix: 'foo' })
        expect(storageCache.get).not.toHaveBeenCalled()
      })

      it('should not write to the cache', async () => {
        await worldStorage.countKeys(worldName, placeId, { prefix: 'foo' })
        expect(storageCache.set).not.toHaveBeenCalled()
      })
    })
  })

  describe('when getting storage size info', () => {
    describe('and a key is provided', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [{ existing_value_size: 10, total_size: 100 }] } as never)
      })

      it('should return the existing value size and total size', async () => {
        const result = await worldStorage.getSizeInfo(worldName, key)
        expect(result).toEqual({ existingValueSize: 10, totalSize: 100 })
      })
    })

    describe('and no key is provided', () => {
      beforeEach(() => {
        pg.query.mockResolvedValueOnce({ rows: [{ existing_value_size: 0, total_size: 250 }] } as never)
      })

      it('should return a zero existing value size and the total size', async () => {
        const result = await worldStorage.getSizeInfo(worldName)
        expect(result).toEqual({ existingValueSize: 0, totalSize: 250 })
      })
    })
  })

  describe('when the cache is disabled and a value is written', () => {
    let disabledWorldStorage: IWorldStorageComponent

    beforeEach(async () => {
      config = createConfigMockedComponent({
        getString: jest.fn().mockResolvedValue('false'),
        getNumber: jest.fn().mockResolvedValue(undefined)
      })
      disabledWorldStorage = await createWorldStorageComponent({
        pg,
        config,
        storageCache,
        logs: createLogsMockedComponent()
      })
      pg.query.mockResolvedValue({ rows: [] } as never)
    })

    it('should not invalidate the cache on setValue', async () => {
      await disabledWorldStorage.setValue(worldName, placeId, key, '"v"')
      expect(storageCache.remove).not.toHaveBeenCalled()
      expect(storageCache.keys).not.toHaveBeenCalled()
    })

    it('should not invalidate the cache on deleteAll', async () => {
      await disabledWorldStorage.deleteAll(worldName, placeId)
      expect(storageCache.remove).not.toHaveBeenCalled()
      expect(storageCache.keys).not.toHaveBeenCalled()
    })
  })
})
