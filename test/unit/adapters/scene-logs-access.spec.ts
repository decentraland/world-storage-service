import type { IPgComponent } from '@dcl/pg-component'
import { createSceneLogsAccessComponent } from '../../../src/adapters/scene-logs-access'
import { createLogsMockedComponent, createPgMockedComponent } from '../../mocks/components'
import type {
  ISceneLogsAccessComponent,
  SceneLogsAccessRow,
  WatcherScene
} from '../../../src/adapters/scene-logs-access/types'

describe('SceneLogsAccessComponent', () => {
  let pg: jest.Mocked<IPgComponent>
  let sceneLogsAccess: ISceneLogsAccessComponent
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

    sceneLogsAccess = await createSceneLogsAccessComponent({ pg, logs: createLogsMockedComponent() })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when upserting the address set for a scene', () => {
    let scene: WatcherScene & { addresses: string[] }

    describe('and there are addresses in the new set', () => {
      beforeEach(() => {
        scene = { sceneId, worldName, baseParcel, title, realmKind, addresses: ['0xAbC', '0xDeF'] }
      })

      it('should delete rows for the scene whose address is not in the new set', async () => {
        await sceneLogsAccess.upsertForScene(scene)
        const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
        expect(statement.text).toContain('DELETE FROM scene_logs_access')
        expect(statement.text).toContain('address <> ALL(')
        expect(statement.values).toEqual([sceneId, ['0xabc', '0xdef']])
      })

      it('should upsert the lowercased addresses in a single insert statement', async () => {
        await sceneLogsAccess.upsertForScene(scene)
        const statement = pg.query.mock.calls[1][0] as unknown as { text: string; values: unknown[] }
        expect(statement.text).toContain('INSERT INTO scene_logs_access')
        expect(statement.text).toContain('ON CONFLICT (scene_id, address) DO UPDATE')
        expect(statement.values).toContain(sceneId)
        expect(statement.values).toEqual(expect.arrayContaining([['0xabc', '0xdef']]))
      })
    })

    describe('and the new address set is empty', () => {
      beforeEach(() => {
        scene = { sceneId, worldName, baseParcel, title, realmKind, addresses: [] }
      })

      it('should delete every row for the scene and issue no other statement', async () => {
        await sceneLogsAccess.upsertForScene(scene)
        expect(pg.query).toHaveBeenCalledTimes(1)
        const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
        expect(statement.text).toBe('DELETE FROM scene_logs_access WHERE scene_id = $1')
        expect(statement.values).toEqual([sceneId])
      })
    })
  })

  describe('when touching a single scene/address row', () => {
    let row: SceneLogsAccessRow

    beforeEach(() => {
      row = { address: '0xAbC', sceneId, worldName, baseParcel, title, realmKind }
    })

    it('should insert the lowercased address with ON CONFLICT DO NOTHING', async () => {
      await sceneLogsAccess.touch(row)
      const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
      expect(statement.text).toContain('ON CONFLICT (scene_id, address) DO NOTHING')
      expect(statement.values).toContain('0xabc')
    })
  })

  describe('when removing a scene', () => {
    it('should delete every row for the scene', async () => {
      await sceneLogsAccess.removeScene(sceneId)
      const statement = pg.query.mock.calls[0][0] as unknown as { text: string; values: unknown[] }
      expect(statement.text).toBe('DELETE FROM scene_logs_access WHERE scene_id = $1')
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
      await sceneLogsAccess.listByAddress('0xAbC', 10, 5)
      const countStatement = pg.query.mock.calls[0][0] as unknown as { values: unknown[] }
      const dataStatement = pg.query.mock.calls[1][0] as unknown as { text: string; values: unknown[] }
      expect(countStatement.values).toEqual(['0xabc'])
      expect(dataStatement.text).toContain('LIMIT')
      expect(dataStatement.text).toContain('OFFSET')
      expect(dataStatement.values).toEqual(['0xabc', 10, 5])
    })

    it('should return the mapped page and total count', async () => {
      const result = await sceneLogsAccess.listByAddress('0xAbC', 10, 5)
      expect(result).toEqual({
        data: [{ sceneId, worldName, baseParcel, title, realmKind }],
        total: 1
      })
    })
  })
})
