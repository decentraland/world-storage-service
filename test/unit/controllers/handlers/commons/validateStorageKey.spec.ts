import { InvalidRequestError } from '@dcl/http-commons'
import { validateStorageKey } from '../../../../../src/controllers/handlers/commons/validateStorageKey'

describe('validateStorageKey', () => {
  describe('when the key is a regular string', () => {
    it('should not throw', () => {
      expect(() => validateStorageKey('player_state')).not.toThrow()
    })
  })

  describe('when the key is exactly 255 characters', () => {
    let key: string

    beforeEach(() => {
      key = 'a'.repeat(255)
    })

    it('should not throw', () => {
      expect(() => validateStorageKey(key)).not.toThrow()
    })
  })

  describe('when the key is longer than 255 characters', () => {
    let key: string

    beforeEach(() => {
      key = 'a'.repeat(256)
    })

    it('should throw an InvalidRequestError with the length constraint', () => {
      expect(() => validateStorageKey(key)).toThrow(new InvalidRequestError('Key must be between 1 and 255 characters'))
    })
  })

  describe('when the key contains multi-byte characters within the limit', () => {
    let key: string

    beforeEach(() => {
      // 255 astral-plane characters: length in UTF-16 units is 510, but Postgres counts
      // 255 varchar characters, so this must be accepted.
      key = '😀'.repeat(255)
    })

    it('should not throw', () => {
      expect(() => validateStorageKey(key)).not.toThrow()
    })
  })

  describe('when the key is empty', () => {
    it('should throw an InvalidRequestError with the length constraint', () => {
      expect(() => validateStorageKey('')).toThrow(new InvalidRequestError('Key must be between 1 and 255 characters'))
    })
  })
})
