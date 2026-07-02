import { buildPrefixPattern } from '../../../src/utils/prefix'

describe('buildPrefixPattern', () => {
  describe('when a prefix without LIKE metacharacters is provided', () => {
    let result: string | null

    beforeEach(() => {
      result = buildPrefixPattern('API')
    })

    it('should return the prefix with a trailing wildcard', () => {
      expect(result).toBe('API%')
    })
  })

  describe('when the prefix contains an underscore', () => {
    let result: string | null

    beforeEach(() => {
      result = buildPrefixPattern('API_')
    })

    it('should escape the underscore so it matches literally', () => {
      expect(result).toBe('API\\_%')
    })
  })

  describe('when the prefix contains a percent sign', () => {
    let result: string | null

    beforeEach(() => {
      result = buildPrefixPattern('100%')
    })

    it('should escape the percent sign so it matches literally', () => {
      expect(result).toBe('100\\%%')
    })
  })

  describe('when the prefix contains a backslash', () => {
    let result: string | null

    beforeEach(() => {
      result = buildPrefixPattern('a\\b')
    })

    it('should escape the backslash so it matches literally', () => {
      expect(result).toBe('a\\\\b%')
    })
  })

  describe('when prefix is undefined', () => {
    let result: string | null

    beforeEach(() => {
      result = buildPrefixPattern(undefined)
    })

    it('should return null', () => {
      expect(result).toBeNull()
    })
  })

  describe('when prefix is an empty string', () => {
    let result: string | null

    beforeEach(() => {
      result = buildPrefixPattern('')
    })

    it('should return null', () => {
      expect(result).toBeNull()
    })
  })
})
