import { isRecord, pickString } from '../../../src/utils/typeGuards'

describe('isRecord', () => {
  describe('when the value is a plain object', () => {
    it('should return true', () => {
      expect(isRecord({ foo: 'bar' })).toBe(true)
    })
  })

  describe('when the value is null', () => {
    it('should return false, so a null metadata never reaches a property read', () => {
      expect(isRecord(null)).toBe(false)
    })
  })

  describe('when the value is a primitive', () => {
    it('should return false', () => {
      expect(isRecord('a string')).toBe(false)
    })
  })
})

describe('pickString', () => {
  describe('when several values are given', () => {
    it('should return the first string one', () => {
      expect(pickString(undefined, 42, 'first', 'second')).toBe('first')
    })
  })

  describe('when no value is a string', () => {
    it('should return undefined', () => {
      expect(pickString(undefined, null, 42)).toBeUndefined()
    })
  })

  describe('when the only string is empty', () => {
    it('should return undefined so an empty id is never taken as resolved', () => {
      expect(pickString('')).toBeUndefined()
    })
  })
})
