import {
  extractLogsPermissions,
  filterStringEntries,
  mapSceneEntity,
  normalizeTitle,
  pickString
} from '../../../src/logic/scene-entity'

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

describe('mapSceneEntity', () => {
  describe('when the entity title exceeds the column length', () => {
    let entity: Record<string, unknown>

    beforeEach(() => {
      entity = {
        timestamp: 100,
        metadata: {
          scene: { base: '0,0', parcels: ['0,0'] },
          display: { title: 'y'.repeat(300) },
          logsPermissions: []
        }
      }
    })

    it('should return a normalized, bounded title', () => {
      expect(mapSceneEntity(entity, 'scene-1')?.title).toHaveLength(255)
    })
  })

  describe('when the entity carries an id of its own', () => {
    let entity: Record<string, unknown>

    beforeEach(() => {
      entity = {
        id: 'id-from-the-payload',
        metadata: { scene: { base: '0,0', parcels: ['0,0'] } }
      }
    })

    it('should use the id supplied by the caller, never the one in the payload', () => {
      expect(mapSceneEntity(entity, 'id-from-the-caller')?.sceneId).toBe('id-from-the-caller')
    })
  })
})

describe('filterStringEntries', () => {
  describe('when the value is an array with mixed entry types', () => {
    it('should keep only the string entries', () => {
      const result = filterStringEntries([123, null, '0xAbC', undefined, 'valid'])

      expect(result).toEqual(['0xAbC', 'valid'])
    })
  })

  describe('when the value is not an array', () => {
    it('should return an empty array for undefined', () => {
      expect(filterStringEntries(undefined)).toEqual([])
    })

    it('should return an empty array for an object', () => {
      expect(filterStringEntries({ foo: 'bar' })).toEqual([])
    })
  })
})

describe('extractLogsPermissions', () => {
  describe('when metadata is missing', () => {
    it('should return an empty array', () => {
      expect(extractLogsPermissions(undefined)).toEqual([])
    })
  })

  describe('when metadata.logsPermissions is not an array', () => {
    it('should return an empty array', () => {
      expect(extractLogsPermissions({ logsPermissions: 'not-an-array' })).toEqual([])
    })
  })

  describe('when metadata.logsPermissions has non-string entries', () => {
    it('should drop the non-string entries', () => {
      const result = extractLogsPermissions({ logsPermissions: [123, null, '0xAbC'] })

      expect(result).toEqual(['0xabc'])
    })
  })

  describe('when metadata.logsPermissions has valid addresses with mixed casing', () => {
    it('should lowercase every entry', () => {
      const result = extractLogsPermissions({ logsPermissions: ['0xAbC', '0xDEF'] })

      expect(result).toEqual(['0xabc', '0xdef'])
    })
  })
})
