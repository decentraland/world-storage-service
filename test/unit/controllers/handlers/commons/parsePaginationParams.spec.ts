import { parseSearchParams } from '../../../../../src/controllers/handlers/commons/parseSearchParams'

describe('parseSearchParams', () => {
  describe('when valid limit and offset are provided', () => {
    let result: ReturnType<typeof parseSearchParams>

    beforeEach(() => {
      const url = new URL('http://localhost/test?limit=10&offset=5')
      result = parseSearchParams(url)
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
    let result: ReturnType<typeof parseSearchParams>

    beforeEach(() => {
      const url = new URL('http://localhost/test?limit=10&offset=0&prefix=API_')
      result = parseSearchParams(url)
    })

    it('should return the prefix', () => {
      expect(result.prefix).toBe('API_')
    })
  })

  describe('when no query params are provided', () => {
    let result: ReturnType<typeof parseSearchParams>

    beforeEach(() => {
      const url = new URL('http://localhost/test')
      result = parseSearchParams(url)
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
    let result: ReturnType<typeof parseSearchParams>

    beforeEach(() => {
      const url = new URL('http://localhost/test?prefix=')
      result = parseSearchParams(url)
    })

    it('should return undefined prefix', () => {
      expect(result.prefix).toBeUndefined()
    })
  })
})
