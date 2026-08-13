import { isSharedRealmName, isWorldName } from '../../../src/utils/worldName'

describe('isWorldName', () => {
  let result: boolean

  describe('when the name has the .dcl.eth suffix', () => {
    beforeEach(() => {
      result = isWorldName('my-world.dcl.eth')
    })

    it('should return true', () => {
      expect(result).toBe(true)
    })
  })

  describe('when the name has the .dcl.eth suffix with different casing', () => {
    beforeEach(() => {
      result = isWorldName('My-World.DCL.eth')
    })

    it('should return true regardless of casing', () => {
      expect(result).toBe(true)
    })
  })

  describe('when the name is an ENS domain', () => {
    beforeEach(() => {
      result = isWorldName('my-world.eth')
    })

    it('should return true so the world is authorized by ENS ownership rather than by LAND at its base parcel', () => {
      expect(result).toBe(true)
    })
  })

  describe('when the name is an ENS domain with different casing', () => {
    beforeEach(() => {
      result = isWorldName('My-World.ETH')
    })

    it('should return true regardless of casing', () => {
      expect(result).toBe(true)
    })
  })

  describe('when the name is an ENS subdomain', () => {
    beforeEach(() => {
      result = isWorldName('arcade.staging.daohq.dappcraft.eth')
    })

    it('should return true', () => {
      expect(result).toBe(true)
    })
  })

  describe('when the name is a shared realm name', () => {
    beforeEach(() => {
      result = isWorldName('main')
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })

  describe('when the name is a zone catalyst realm name', () => {
    beforeEach(() => {
      result = isWorldName('artemis')
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })

  describe('when the name only contains the suffix mid-name', () => {
    beforeEach(() => {
      result = isWorldName('foo.dcl.eth.evil')
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })

  describe('when the name ends with eth but not as a dot-delimited label', () => {
    beforeEach(() => {
      result = isWorldName('mammoth')
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })
})

describe('isSharedRealmName', () => {
  let result: boolean

  describe('when the name is a Genesis City realm', () => {
    beforeEach(() => {
      result = isSharedRealmName('main')
    })

    it('should return true', () => {
      expect(result).toBe(true)
    })
  })

  describe('when the name is a Decentraland World', () => {
    beforeEach(() => {
      result = isSharedRealmName('my-world.dcl.eth')
    })

    it('should return false', () => {
      expect(result).toBe(false)
    })
  })

  describe('when the name is an ENS world', () => {
    beforeEach(() => {
      result = isSharedRealmName('my-world.eth')
    })

    it('should return false so its storage is scoped per world instead of per place', () => {
      expect(result).toBe(false)
    })
  })
})
