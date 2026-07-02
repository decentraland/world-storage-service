import { isDclWorldName, isSharedRealmName } from '../../../src/utils/worldName'

describe('isDclWorldName', () => {
  describe('when the name has the .dcl.eth suffix', () => {
    it('should return true', () => {
      expect(isDclWorldName('my-world.dcl.eth')).toBe(true)
    })
  })

  describe('when the name has the .dcl.eth suffix with different casing', () => {
    it('should return true regardless of casing', () => {
      expect(isDclWorldName('My-World.DCL.eth')).toBe(true)
    })
  })

  describe('when the name is a shared realm name', () => {
    it('should return false', () => {
      expect(isDclWorldName('main')).toBe(false)
    })
  })

  describe('when the name only contains the suffix mid-name', () => {
    it('should return false', () => {
      expect(isDclWorldName('foo.dcl.eth.evil')).toBe(false)
    })
  })
})

describe('isSharedRealmName', () => {
  describe('when the name is a Genesis City realm', () => {
    it('should return true', () => {
      expect(isSharedRealmName('main')).toBe(true)
    })
  })

  describe('when the name is a Decentraland World', () => {
    it('should return false', () => {
      expect(isSharedRealmName('my-world.dcl.eth')).toBe(false)
    })
  })
})
