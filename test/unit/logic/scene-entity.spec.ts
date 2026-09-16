import { mapSceneEntity, normalizeTitle } from '../../../src/logic/scene-entity'

describe('normalizeTitle', () => {
  describe('when the value is not a string', () => {
    it('should return null', () => {
      expect(normalizeTitle(undefined)).toBeNull()
      expect(normalizeTitle(123)).toBeNull()
      expect(normalizeTitle(null)).toBeNull()
    })
  })

  describe('and the value is whitespace only', () => {
    it('should return null', () => {
      expect(normalizeTitle('   ')).toBeNull()
    })
  })

  describe('and the value has surrounding whitespace', () => {
    it('should trim it', () => {
      expect(normalizeTitle('  My Scene  ')).toBe('My Scene')
    })
  })

  describe('and the value contains control and escape characters', () => {
    it('should strip them so a terminal consumer cannot be injected', () => {
      const withControls = `A${String.fromCharCode(0x00)}B${String.fromCharCode(0x1b)}[31mC${String.fromCharCode(0x7f)}`
      expect(normalizeTitle(withControls)).toBe('AB[31mC')
    })
  })

  describe('and the value exceeds the column length', () => {
    it('should truncate to 255 characters', () => {
      expect(normalizeTitle('x'.repeat(300))).toHaveLength(255)
    })
  })

  describe('and the value contains HTML', () => {
    it('should preserve it literally, leaving escaping to the render context', () => {
      expect(normalizeTitle('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
    })
  })
})

describe('mapSceneEntity', () => {
  describe('when the entity title exceeds the column length', () => {
    let entity: Record<string, unknown>

    beforeEach(() => {
      entity = {
        id: 'scene-1',
        timestamp: 100,
        metadata: {
          scene: { base: '0,0', parcels: ['0,0'] },
          display: { title: 'y'.repeat(300) },
          logsPermissions: []
        }
      }
    })

    it('should return a normalized, bounded title', () => {
      expect(mapSceneEntity(entity)?.title).toHaveLength(255)
    })
  })
})
