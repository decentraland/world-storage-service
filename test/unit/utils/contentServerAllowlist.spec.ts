import {
  parseAllowedWorldsContentServerHosts,
  resolveSourceContentServerUrl,
  toBareOrigin
} from '../../../src/utils/contentServerAllowlist'
import type { SourceContentServerResolution } from '../../../src/utils/contentServerAllowlist'

describe('parseAllowedWorldsContentServerHosts', () => {
  describe('when the value lists hosts with spacing, casing and blanks', () => {
    let raw: string

    beforeEach(() => {
      raw = ' Worlds-Content-Server.dcl.dev, ,worlds-content-server.decentraland.org,'
    })

    it('should return the trimmed, lowercased, non-blank hosts', () => {
      expect(parseAllowedWorldsContentServerHosts(raw)).toEqual(
        new Set(['worlds-content-server.dcl.dev', 'worlds-content-server.decentraland.org'])
      )
    })
  })

  describe('when the value is absent', () => {
    it('should return an empty set', () => {
      expect(parseAllowedWorldsContentServerHosts(undefined)).toEqual(new Set())
    })
  })
})

describe('toBareOrigin', () => {
  let raw: unknown

  describe('when the URL is an uppercase origin with a trailing slash', () => {
    beforeEach(() => {
      raw = 'HTTPS://Worlds-Content-Server.DCL.dev/'
    })

    it('should return the lowercased origin without the trailing slash', () => {
      expect(toBareOrigin(raw)).toBe('https://worlds-content-server.dcl.dev')
    })
  })

  describe('when the URL has a path', () => {
    beforeEach(() => {
      raw = 'https://worlds-content-server.dcl.dev/worlds-content-server'
    })

    it('should return null', () => {
      expect(toBareOrigin(raw)).toBeNull()
    })
  })

  describe('when the URL has a query or fragment', () => {
    beforeEach(() => {
      raw = 'https://worlds-content-server.dcl.dev/?q=1#frag'
    })

    it('should return null', () => {
      expect(toBareOrigin(raw)).toBeNull()
    })
  })

  describe('when the URL sets an explicit port', () => {
    beforeEach(() => {
      raw = 'https://worlds-content-server.dcl.dev:8443'
    })

    it('should return null', () => {
      expect(toBareOrigin(raw)).toBeNull()
    })
  })

  describe('when the URL carries credentials', () => {
    beforeEach(() => {
      raw = 'https://user:pass@worlds-content-server.dcl.dev'
    })

    it('should return null', () => {
      expect(toBareOrigin(raw)).toBeNull()
    })
  })

  describe('when the URL is not HTTPS', () => {
    beforeEach(() => {
      raw = 'http://worlds-content-server.dcl.dev'
    })

    it('should return null', () => {
      expect(toBareOrigin(raw)).toBeNull()
    })
  })

  describe('when the value is not a string', () => {
    beforeEach(() => {
      raw = 42
    })

    it('should return null', () => {
      expect(toBareOrigin(raw)).toBeNull()
    })
  })
})

describe('resolveSourceContentServerUrl', () => {
  let allowedHosts: Set<string>
  let defaultOrigin: string
  let raw: string

  beforeEach(() => {
    allowedHosts = new Set(['worlds-content-server.dcl.dev'])
    defaultOrigin = 'https://worlds-content-server.decentraland.org'
  })

  describe('when the source is an allowlisted bare origin', () => {
    beforeEach(() => {
      raw = 'HTTPS://Worlds-Content-Server.DCL.dev/'
    })

    it('should resolve to that origin as the source', () => {
      expect(resolveSourceContentServerUrl(raw, allowedHosts, defaultOrigin)).toEqual<SourceContentServerResolution>({
        ok: true,
        origin: 'https://worlds-content-server.dcl.dev',
        source: 'https://worlds-content-server.dcl.dev'
      })
    })
  })

  describe('when the source is the default server origin', () => {
    beforeEach(() => {
      raw = 'https://Worlds-Content-Server.decentraland.org'
    })

    describe('and the default host is not allowlisted', () => {
      it('should resolve to the default source (null)', () => {
        expect(resolveSourceContentServerUrl(raw, allowedHosts, defaultOrigin)).toEqual<SourceContentServerResolution>({
          ok: true,
          origin: defaultOrigin,
          source: null
        })
      })
    })

    describe('and the allowlist is empty', () => {
      beforeEach(() => {
        allowedHosts = new Set()
      })

      it('should resolve to the default source (null)', () => {
        expect(resolveSourceContentServerUrl(raw, allowedHosts, defaultOrigin)).toEqual<SourceContentServerResolution>({
          ok: true,
          origin: defaultOrigin,
          source: null
        })
      })
    })
  })

  describe('when the source has a path on an allowlisted host', () => {
    beforeEach(() => {
      raw = 'https://worlds-content-server.dcl.dev/worlds-content-server'
    })

    it('should reject it as not a bare origin', () => {
      expect(resolveSourceContentServerUrl(raw, allowedHosts, defaultOrigin)).toEqual<SourceContentServerResolution>({
        ok: false,
        reason: 'not_bare_origin'
      })
    })
  })

  describe('when the source host only shares a suffix with an allowlisted host', () => {
    beforeEach(() => {
      raw = 'https://evil-worlds-content-server.dcl.dev'
    })

    it('should reject it as not allowlisted', () => {
      expect(resolveSourceContentServerUrl(raw, allowedHosts, defaultOrigin)).toEqual<SourceContentServerResolution>({
        ok: false,
        reason: 'not_allowlisted'
      })
    })
  })
})
