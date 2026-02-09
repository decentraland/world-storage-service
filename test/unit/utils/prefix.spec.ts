import { buildPrefixPattern } from '../../../src/utils/prefix'

describe('buildPrefixPattern', () => {
  describe('when a prefix is provided', () => {
    let result: string | null

    beforeEach(() => {
      result = buildPrefixPattern('API_')
    })

    it('should return the prefix with a trailing wildcard', () => {
      expect(result).toBe('API_%')
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
