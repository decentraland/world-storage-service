import { parsePaginationParams } from '../../../../../src/controllers/handlers/commons/parsePaginationParams'

describe('parsePaginationParams', () => {
  describe('when valid limit and offset are provided', () => {
    let result: ReturnType<typeof parsePaginationParams>

    beforeEach(() => {
      const url = new URL('http://localhost/test?limit=10&offset=5')
      result = parsePaginationParams(url)
    })

    it('should return the parsed limit', () => {
      expect(result.limit).toBe(10)
    })

    it('should return the parsed offset', () => {
      expect(result.offset).toBe(5)
    })

    it('should return undefined prefix', () => {
      expect(result.prefix).toBeUndefined()
    })
  })

  describe('when a prefix is provided', () => {
    let result: ReturnType<typeof parsePaginationParams>

    beforeEach(() => {
      const url = new URL('http://localhost/test?limit=10&offset=0&prefix=API_')
      result = parsePaginationParams(url)
    })

    it('should return the prefix', () => {
      expect(result.prefix).toBe('API_')
    })
  })

  describe('when no query params are provided', () => {
    let result: ReturnType<typeof parsePaginationParams>

    beforeEach(() => {
      const url = new URL('http://localhost/test')
      result = parsePaginationParams(url)
    })

    it('should return default limit of 100', () => {
      expect(result.limit).toBe(100)
    })

    it('should return default offset of 0', () => {
      expect(result.offset).toBe(0)
    })

    it('should return undefined prefix', () => {
      expect(result.prefix).toBeUndefined()
    })
  })

  describe('when prefix is an empty string', () => {
    let result: ReturnType<typeof parsePaginationParams>

    beforeEach(() => {
      const url = new URL('http://localhost/test?prefix=')
      result = parsePaginationParams(url)
    })

    it('should return undefined prefix', () => {
      expect(result.prefix).toBeUndefined()
    })
  })
})
