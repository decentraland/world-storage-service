import type { IPgComponent } from '@well-known-components/pg-component'
import { createWorldStorageComponent } from '../../../src/logic/world-storage/component'
import type { WorldStorageItem } from '../../../src/logic/world-storage/types'

interface SqlQuery {
  text?: string
  values?: unknown[]
}

describe('World Storage DB Component', () => {
  let pg: Pick<IPgComponent, 'query' | 'start' | 'streamQuery' | 'getPool' | 'stop'>
  let worldStorage: ReturnType<typeof createWorldStorageComponent>

  let worldName: string
  let key: string
  let value: unknown

  beforeEach(() => {
    pg = {
      query: jest.fn()
    } as unknown as Pick<IPgComponent, 'query' | 'start' | 'streamQuery' | 'getPool' | 'stop'>

    worldStorage = createWorldStorageComponent({ pg })

    worldName = 'my-world'
    key = 'my-key'
    value = { foo: 'bar' }
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.resetAllMocks()
  })

  describe('when calling getValue', () => {
    describe('and the query returns a row', () => {
      let result: unknown | null
      let queryArg: SqlQuery

      beforeEach(async () => {
        ;(pg.query as jest.Mock).mockResolvedValueOnce({ rows: [{ value }] })

        result = await worldStorage.getValue(worldName, key)
        queryArg = (pg.query as jest.Mock).mock.calls[0][0] as SqlQuery
      })

      it('should return the value', () => {
        expect(result).toBe(value)
      })

      it('should query by world name and key', () => {
        expect(queryArg.values).toEqual([worldName, key])
      })
    })

    describe('and the query returns no rows', () => {
      let result: unknown | null

      beforeEach(async () => {
        ;(pg.query as jest.Mock).mockResolvedValueOnce({ rows: [] })
        result = await worldStorage.getValue(worldName, key)
      })

      it('should return null', () => {
        expect(result).toBeNull()
      })
    })
  })

  describe('when calling setValue', () => {
    describe('and the query returns the inserted row', () => {
      let now: string
      let jsonValue: string
      let item: WorldStorageItem
      let result: WorldStorageItem
      let queryArg: SqlQuery

      beforeEach(async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
        now = new Date().toISOString()
        jsonValue = JSON.stringify(value)

        item = { worldName, key, value }
        ;(pg.query as jest.Mock).mockResolvedValueOnce({ rows: [item] })

        result = await worldStorage.setValue(worldName, key, value)
        queryArg = (pg.query as jest.Mock).mock.calls[0][0] as SqlQuery
      })

      it('should return the stored item', () => {
        expect(result).toEqual(item)
      })

      it('should pass world name, key, value and timestamps as query values', () => {
        expect(queryArg.values).toEqual([worldName, key, jsonValue, now, now, jsonValue, now])
      })
    })
  })

  describe('when calling deleteValue', () => {
    let queryArg: SqlQuery

    beforeEach(async () => {
      ;(pg.query as jest.Mock).mockResolvedValueOnce({ rows: [] })
      await worldStorage.deleteValue(worldName, key)
      queryArg = (pg.query as jest.Mock).mock.calls[0][0] as SqlQuery
    })

    it('should call pg.query once', () => {
      expect((pg.query as jest.Mock).mock.calls.length).toBe(1)
    })

    it('should query by world name and key', () => {
      expect(queryArg.values).toEqual([worldName, key])
    })
  })
})
