import {
  parseAllowedContentServerHosts,
  resolveAllowedContentServerUrl
} from '../../../src/utils/contentServerAllowlist'

describe('parseAllowedContentServerHosts', () => {
  describe('when the value lists hosts with spacing, casing and blanks', () => {
    let raw: string

    beforeEach(() => {
      raw = ' Worlds-Content-Server.dcl.dev, ,peer.decentraland.org,'
    })

    it('should return the trimmed, lowercased, non-blank hosts', () => {
      expect(parseAllowedContentServerHosts(raw)).toEqual(
        new Set(['worlds-content-server.dcl.dev', 'peer.decentraland.org'])
      )
    })
  })

  describe('when the value is absent', () => {
    it('should return an empty set', () => {
      expect(parseAllowedContentServerHosts(undefined)).toEqual(new Set())
    })
  })
})

describe('resolveAllowedContentServerUrl', () => {
  let allowedHosts: Set<string>

  beforeEach(() => {
    allowedHosts = new Set(['worlds-content-server.dcl.dev'])
  })

  describe('when the URL is HTTPS on an allowlisted host', () => {
    let raw: string

    beforeEach(() => {
      raw = 'https://Worlds-Content-Server.dcl.dev/?q=1#frag'
    })

    it('should return the base URL without trailing slash, query or fragment', () => {
      expect(resolveAllowedContentServerUrl(raw, allowedHosts)).toBe('https://worlds-content-server.dcl.dev')
    })
  })

  describe('when the URL host only shares a suffix with an allowlisted host', () => {
    let raw: string

    beforeEach(() => {
      raw = 'https://evil-worlds-content-server.dcl.dev'
    })

    it('should return null', () => {
      expect(resolveAllowedContentServerUrl(raw, allowedHosts)).toBeNull()
    })
  })

  describe('when the URL sets an explicit port', () => {
    let raw: string

    beforeEach(() => {
      raw = 'https://worlds-content-server.dcl.dev:8443'
    })

    it('should return null', () => {
      expect(resolveAllowedContentServerUrl(raw, allowedHosts)).toBeNull()
    })
  })

  describe('when the allowlist is empty', () => {
    let raw: string

    beforeEach(() => {
      allowedHosts = new Set()
      raw = 'https://worlds-content-server.dcl.dev'
    })

    it('should return null', () => {
      expect(resolveAllowedContentServerUrl(raw, allowedHosts)).toBeNull()
    })
  })

  describe('when the value is not a string', () => {
    it('should return null', () => {
      expect(resolveAllowedContentServerUrl(42, allowedHosts)).toBeNull()
    })
  })
})
