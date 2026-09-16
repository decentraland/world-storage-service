import type { IPgComponent } from '@dcl/pg-component'
import { createSceneCollaboratorsComponent } from '../../../src/adapters/scene-collaborators'
import { createLogsMockedComponent, createPgMockedComponent } from '../../mocks/components'
import type {
  CollaboratorScene,
  ISceneCollaboratorsComponent,
  SceneCollaboratorsRow
} from '../../../src/adapters/scene-collaborators/types'

describe('SceneCollaboratorsComponent', () => {
  let pg: jest.Mocked<IPgComponent>
  let sceneCollaborators: ISceneCollaboratorsComponent
  let sceneId: string
  let worldName: string
  let baseParcel: string
  let title: string | null
  let realmKind: 'world' | 'genesis'

  beforeEach(async () => {
    sceneId = 'scene-1'
    worldName = 'my-world.dcl.eth'
    baseParcel = '0,0'
    title = 'My Scene'
    realmKind = 'world'

    pg = createPgMockedComponent()
    pg.query.mockResolvedValue({ rows: [] } as never)

    sceneCollaborators = await createSceneCollaboratorsComponent({ pg, logs: createLogsMockedComponent() })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when upserting the address set for a scene', () => {
    let scene: CollaboratorScene & { addresses: string[]; deployedAt: number }

    describe('and there are addresses in the new set', () => {
      beforeEach(() => {
        scene = { sceneId, worldName, baseParcel, title, realmKind, deployedAt: 100, addresses: ['0xAbC', '0xDeF'] }
      })

      it('should first read the newest deployment indexed at the world and parcel', async () => {
        await sceneCollaborators.upsertForScene(scene)
        const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
        expect(statement.text).toContain('MAX(deployed_at)')
        expect(statement.values).toEqual([worldName, baseParcel])
      })

      it('should replace any other scene indexed at the same world and parcel', async () => {
        await sceneCollaborators.upsertForScene(scene)
        const statement = pg.query.mock.calls[1][0] as unknown as { text: string; values: unknown[] }
        expect(statement.text).toContain('DELETE FROM scene_collaborators')
        expect(statement.text).toContain('scene_id <>')
        expect(statement.values).toEqual([worldName, baseParcel, sceneId])
      })

      it('should delete rows for the scene whose address is not in the new set', async () => {
        await sceneCollaborators.upsertForScene(scene)
        const statement = pg.query.mock.calls[2][0] as unknown as { text: string; values: unknown[] }
        expect(statement.text).toContain('address <> ALL(')
        expect(statement.values).toEqual([sceneId, ['0xabc', '0xdef']])
      })

      it('should upsert the lowercased addresses with the deployment timestamp', async () => {
        await sceneCollaborators.upsertForScene(scene)
        const statement = pg.query.mock.calls[3][0] as unknown as { text: string; values: unknown[] }
        expect(statement.text).toContain('INSERT INTO scene_collaborators')
        expect(statement.text).toContain('ON CONFLICT (scene_id, address) DO UPDATE')
        expect(statement.values).toContain(sceneId)
        expect(statement.values).toContain(100)
        expect(statement.values).toEqual(expect.arrayContaining([['0xabc', '0xdef']]))
      })
    })

    describe('and a newer deployment is already indexed at the world and parcel', () => {
      beforeEach(() => {
        scene = { sceneId, worldName, baseParcel, title, realmKind, deployedAt: 100, addresses: ['0xAbC'] }
        pg.query.mockResolvedValueOnce({ rows: [{ max_deployed_at: '200' }] } as never)
      })

      it('should skip the destructive replacement and issue no other statement', async () => {
        await sceneCollaborators.upsertForScene(scene)
        expect(pg.query).toHaveBeenCalledTimes(1)
        const statement = pg.query.mock.calls[0][0] as unknown as { text: string }
        expect(statement.text).toContain('MAX(deployed_at)')
      })
    })

    describe('and the new set has duplicate and casing-only-duplicate addresses', () => {
      beforeEach(() => {
        scene = {
          sceneId,
          worldName,
          baseParcel,
          title,
          realmKind,
          deployedAt: 100,
          addresses: ['0xAbC', '0xabc', '0xDeF', '0xdef']
        }
      })

      it('should deduplicate to one normalized address per row before inserting', async () => {
        await sceneCollaborators.upsertForScene(scene)
        const statement = pg.query.mock.calls[3][0] as unknown as { values: unknown[] }
        expect(statement.values).toEqual(expect.arrayContaining([['0xabc', '0xdef']]))
      })
    })

    describe('and the new address set is empty', () => {
      beforeEach(() => {
        scene = { sceneId, worldName, baseParcel, title, realmKind, deployedAt: 100, addresses: [] }
      })

      it('should clear every row indexed at the world and parcel after the newest check', async () => {
        await sceneCollaborators.upsertForScene(scene)
        expect(pg.query).toHaveBeenCalledTimes(2)
        const statement = pg.query.mock.calls[1][0] as unknown as { text: string; values: unknown[] }
        expect(statement.text).toContain('DELETE FROM scene_collaborators')
        expect(statement.text).toContain('world_name =')
        expect(statement.text).toContain('base_parcel =')
        expect(statement.values).toEqual([worldName, baseParcel])
      })
    })

    describe('and the world name has mixed casing', () => {
      beforeEach(() => {
        scene = {
          sceneId,
          worldName: 'My-World.DCL.eth',
          baseParcel,
          title,
          realmKind,
          deployedAt: 100,
          addresses: ['0xAbC']
        }
      })

      it('should lowercase the world name in the staleness guard', async () => {
        await sceneCollaborators.upsertForScene(scene)
        const statement = pg.query.mock.calls[0][0] as unknown as { values: unknown[] }
        expect(statement.values).toEqual(['my-world.dcl.eth', baseParcel])
      })

      it('should lowercase the world name in the insert', async () => {
        await sceneCollaborators.upsertForScene(scene)
        const statement = pg.query.mock.calls[3][0] as unknown as { values: unknown[] }
        expect(statement.values).toEqual(expect.arrayContaining(['my-world.dcl.eth']))
      })
    })
  })

  describe('when touching a single scene/address row', () => {
    let row: SceneCollaboratorsRow

    beforeEach(() => {
      row = { address: '0xAbC', sceneId, worldName, baseParcel, title, realmKind, deployedAt: 150 }
    })

    it('should insert the lowercased address with ON CONFLICT DO NOTHING', async () => {
      await sceneCollaborators.touch(row)
      const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
      expect(statement.text).toContain('ON CONFLICT (scene_id, address) DO NOTHING')
      expect(statement.values).toContain('0xabc')
      expect(statement.values).toContain(150)
    })

    it('should lowercase the world name', async () => {
      await sceneCollaborators.touch({ ...row, worldName: 'My-World.DCL.eth' })
      const statement = pg.query.mock.calls[0][0] as unknown as { values: unknown[] }
      expect(statement.values).toContain('my-world.dcl.eth')
    })
  })

  describe('when removing every row for a world', () => {
    it('should delete by world_name', async () => {
      await sceneCollaborators.removeByWorld('myworld.dcl.eth')
      const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
      expect(statement.text).toBe('DELETE FROM scene_collaborators WHERE world_name = $1')
      expect(statement.values).toEqual(['myworld.dcl.eth'])
    })

    it('should lowercase the world name', async () => {
      await sceneCollaborators.removeByWorld('MyWorld.DCL.eth')
      const statement = pg.query.mock.calls[0][0] as unknown as { values: unknown[] }
      expect(statement.values).toEqual(['myworld.dcl.eth'])
    })
  })

  describe('when removing a scene', () => {
    it('should delete every row for the scene', async () => {
      await sceneCollaborators.removeScene(sceneId)
      const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
      expect(statement.text).toBe('DELETE FROM scene_collaborators WHERE scene_id = $1')
      expect(statement.values).toEqual([sceneId])
    })
  })

  describe('when listing scenes by address', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [{ count: 1 }] } as never).mockResolvedValueOnce({
        rows: [{ scene_id: sceneId, world_name: worldName, base_parcel: baseParcel, title, realm_kind: realmKind }]
      } as never)
    })

    it('should lowercase the address and paginate', async () => {
      await sceneCollaborators.listByAddress('0xAbC', 10, 5)
      const countStatement = pg.query.mock.calls[0][0] as unknown as { values: unknown[] }
      const dataStatement = pg.query.mock.calls[1][0] as unknown as { text: string; values: unknown[] }
      expect(countStatement.values).toEqual(['0xabc'])
      expect(dataStatement.text).toContain('LIMIT')
      expect(dataStatement.text).toContain('OFFSET')
      expect(dataStatement.values).toEqual(['0xabc', 10, 5])
    })

    it('should return the mapped page and total count', async () => {
      const result = await sceneCollaborators.listByAddress('0xAbC', 10, 5)
      expect(result).toEqual({
        data: [{ sceneId, worldName, baseParcel, title, realmKind }],
        total: 1
      })
    })
  })
})
