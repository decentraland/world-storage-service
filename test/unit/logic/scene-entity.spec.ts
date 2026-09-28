import { createSceneEntityComponent } from '../../../src/logic/scene-entity'
import type { ISceneEntityComponent } from '../../../src/logic/scene-entity/types'

describe('SceneEntityComponent', () => {
  let sceneEntity: ISceneEntityComponent

  beforeEach(async () => {
    sceneEntity = await createSceneEntityComponent()
  })

  describe('when normalizing a title', () => {
    describe('and the value is not a string', () => {
      it('should return null', () => {
        expect(sceneEntity.normalizeTitle(undefined)).toBeNull()
        expect(sceneEntity.normalizeTitle(123)).toBeNull()
        expect(sceneEntity.normalizeTitle(null)).toBeNull()
      })
    })

    describe('and the value is whitespace only', () => {
      it('should return null', () => {
        expect(sceneEntity.normalizeTitle('   ')).toBeNull()
      })
    })

    describe('and the value has surrounding whitespace', () => {
      it('should trim it', () => {
        expect(sceneEntity.normalizeTitle('  My Scene  ')).toBe('My Scene')
      })
    })

    describe('and the value contains control and escape characters', () => {
      it('should strip them so a terminal consumer cannot be injected', () => {
        const withControls = `A${String.fromCharCode(0x00)}B${String.fromCharCode(0x1b)}[31mC${String.fromCharCode(0x7f)}`

        expect(sceneEntity.normalizeTitle(withControls)).toBe('AB[31mC')
      })
    })

    describe('and the value exceeds the column length', () => {
      it('should truncate to 255 characters', () => {
        expect(sceneEntity.normalizeTitle('x'.repeat(300))).toHaveLength(255)
      })
    })

    describe('and the value contains HTML', () => {
      it('should preserve it literally, leaving escaping to the render context', () => {
        expect(sceneEntity.normalizeTitle('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
      })
    })
  })

  describe('when extracting logs permissions', () => {
    describe('and the metadata is missing', () => {
      it('should return an empty array', () => {
        expect(sceneEntity.extractLogsPermissions(undefined)).toEqual([])
      })
    })

    describe('and logsPermissions is not an array', () => {
      it('should return an empty array', () => {
        expect(sceneEntity.extractLogsPermissions({ logsPermissions: 'not-an-array' })).toEqual([])
      })
    })

    describe('and logsPermissions has non-string entries', () => {
      it('should drop the non-string entries', () => {
        expect(sceneEntity.extractLogsPermissions({ logsPermissions: [123, null, '0xAbC'] })).toEqual(['0xabc'])
      })
    })

    describe('and logsPermissions has valid addresses with mixed casing', () => {
      it('should lowercase every entry', () => {
        expect(sceneEntity.extractLogsPermissions({ logsPermissions: ['0xAbC', '0xDEF'] })).toEqual(['0xabc', '0xdef'])
      })
    })
  })

  describe('when mapping a scene entity', () => {
    describe('and the entity title exceeds the column length', () => {
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
        expect(sceneEntity.mapSceneEntity(entity, 'scene-1')?.title).toHaveLength(255)
      })
    })

    describe('and the entity carries an id of its own', () => {
      let entity: Record<string, unknown>

      beforeEach(() => {
        entity = {
          id: 'id-from-the-payload',
          metadata: { scene: { base: '0,0', parcels: ['0,0'] } }
        }
      })

      it('should use the id supplied by the caller, never the one in the payload', () => {
        expect(sceneEntity.mapSceneEntity(entity, 'id-from-the-caller')?.sceneId).toBe('id-from-the-caller')
      })
    })

    describe('and the entity is missing its scene base and parcels', () => {
      it('should return null for the caller to discard', () => {
        expect(sceneEntity.mapSceneEntity({ metadata: {} }, 'scene-1')).toBeNull()
      })
    })
  })
})
