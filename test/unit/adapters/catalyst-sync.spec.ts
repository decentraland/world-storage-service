import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import type { IFetchComponent } from '@dcl/core-commons'
import { createConfigMockedComponent, createFetchMockedComponent } from '@dcl/core-commons'
import type { IPgComponent } from '@dcl/pg-component'
import { createCatalystSyncComponent } from '../../../src/adapters/catalyst-sync'
import { ADDRESSES, PARCELS } from '../../fixtures'
import { createLogsMockedComponent, createPgMockedComponent } from '../../mocks/components'
import { createCatalystContentMockedComponent } from '../../mocks/components/catalyst-content'
import type { ICatalystContentComponent } from '../../../src/adapters/catalyst-content/types'
import type { ICatalystSyncComponent } from '../../../src/adapters/catalyst-sync/types'
import type { ISceneLogsAccessComponent, WatcherScene } from '../../../src/adapters/scene-logs-access/types'

describe('CatalystSyncComponent', () => {
  const contentUrl = 'https://peer.decentraland.org/content'
  const entityId = 'entity-1'

  let fetcher: jest.Mocked<IFetchComponent>
  let pg: jest.Mocked<IPgComponent>
  let catalystContent: jest.Mocked<ICatalystContentComponent>
  let sceneLogsAccess: jest.Mocked<ISceneLogsAccessComponent>
  let catalystSync: ICatalystSyncComponent

  function mockResponse(response: Partial<Response>): Response {
    return response as Response
  }

  async function startCatalystSync(component: ICatalystSyncComponent): Promise<void> {
    const start = component[START_COMPONENT]
    if (!start) {
      throw new Error('catalystSync component does not implement START_COMPONENT')
    }
    await start({ started: () => true, live: () => true, getComponents: () => ({}) })
  }

  async function stopCatalystSync(component: ICatalystSyncComponent): Promise<void> {
    const stop = component[STOP_COMPONENT]
    if (!stop) {
      throw new Error('catalystSync component does not implement STOP_COMPONENT')
    }
    await stop()
  }

  function buildScene(overrides: Partial<WatcherScene> & { logsPermissions?: string[] } = {}): {
    sceneId: string
    base: string
    parcels: string[]
    title: string | null
    logsPermissions: string[]
  } {
    return {
      sceneId: overrides.sceneId ?? entityId,
      base: overrides.baseParcel ?? PARCELS.GENESIS_CITY,
      parcels: [overrides.baseParcel ?? PARCELS.GENESIS_CITY],
      title: overrides.title === undefined ? 'My Scene' : overrides.title,
      logsPermissions: overrides.logsPermissions ?? [ADDRESSES.AUTHORIZED.toLowerCase()]
    }
  }

  async function createComponent(): Promise<ICatalystSyncComponent> {
    return createCatalystSyncComponent({
      config: createConfigMockedComponent({
        requireString: jest.fn().mockResolvedValue(contentUrl),
        getNumber: jest.fn().mockResolvedValue(60)
      }),
      logs: createLogsMockedComponent(),
      fetcher,
      pg,
      catalystContent,
      sceneLogsAccess
    })
  }

  beforeEach(() => {
    fetcher = createFetchMockedComponent() as jest.Mocked<IFetchComponent>
    pg = createPgMockedComponent()
    catalystContent = createCatalystContentMockedComponent()
    sceneLogsAccess = {
      upsertForScene: jest.fn(),
      touch: jest.fn(),
      removeScene: jest.fn(),
      listByAddress: jest.fn()
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.useRealTimers()
  })

  describe('when starting with an existing cursor', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [{ cursor: '100' }] } as never)
    })

    describe('and the pointer-changes page has an active scene change', () => {
      let scene: ReturnType<typeof buildScene>

      beforeEach(async () => {
        scene = buildScene({ logsPermissions: [ADDRESSES.AUTHORIZED, ADDRESSES.ANOTHER_AUTHORIZED] })

        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue({
              deltas: [{ entityId, entityType: 'scene', pointers: [PARCELS.GENESIS_CITY], localTimestamp: 200 }]
            })
          })
        )
        catalystContent.getActiveSceneEntity.mockResolvedValueOnce(scene)

        catalystSync = await createComponent()
        await startCatalystSync(catalystSync)
      })

      it('should not run the snapshots bootstrap', () => {
        expect(fetcher.fetch).not.toHaveBeenCalledWith(`${contentUrl}/snapshots`, expect.anything())
      })

      it('should resolve the active entity for the changed parcel', () => {
        expect(catalystContent.getActiveSceneEntity).toHaveBeenCalledWith(PARCELS.GENESIS_CITY)
      })

      it('should upsert the scene with lowercased addresses and realmKind genesis', () => {
        expect(sceneLogsAccess.upsertForScene).toHaveBeenCalledWith({
          sceneId: scene.sceneId,
          worldName: 'main',
          baseParcel: scene.base,
          title: scene.title,
          realmKind: 'genesis',
          addresses: [ADDRESSES.AUTHORIZED, ADDRESSES.ANOTHER_AUTHORIZED]
        })
      })

      it('should persist the cursor advanced to the last processed timestamp', () => {
        const insertCall = pg.query.mock.calls.find(call => {
          const statement = call[0] as unknown as { text: string }
          return statement.text.includes('INSERT INTO sync_cursor')
        })
        const statement = insertCall?.[0] as unknown as { values: unknown[] }
        expect(statement.values).toContain('200')
      })
    })

    describe('and the pointer-changes page has a deletion (no active entity at the parcel)', () => {
      beforeEach(async () => {
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue({
              deltas: [{ entityId, entityType: 'scene', pointers: [PARCELS.GENESIS_CITY], localTimestamp: 200 }]
            })
          })
        )
        catalystContent.getActiveSceneEntity.mockResolvedValueOnce(null)

        catalystSync = await createComponent()
        await startCatalystSync(catalystSync)
      })

      it('should remove the scene by its entity id', () => {
        expect(sceneLogsAccess.removeScene).toHaveBeenCalledWith(entityId)
        expect(sceneLogsAccess.upsertForScene).not.toHaveBeenCalled()
      })
    })

    describe('and the pointer-changes page has a malformed item', () => {
      beforeEach(async () => {
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue({
              deltas: [
                { entityId, entityType: 'scene' },
                { entityType: 'scene', pointers: [PARCELS.GENESIS_CITY] }
              ]
            })
          })
        )

        catalystSync = await createComponent()
        await startCatalystSync(catalystSync)
      })

      it('should skip the malformed items without resolving any scene', () => {
        expect(catalystContent.getActiveSceneEntity).not.toHaveBeenCalled()
        expect(sceneLogsAccess.upsertForScene).not.toHaveBeenCalled()
        expect(sceneLogsAccess.removeScene).not.toHaveBeenCalled()
      })

      it('should not persist a new cursor', () => {
        const insertCall = pg.query.mock.calls.find(call => {
          const statement = call[0] as unknown as { text: string }
          return statement.text.includes('INSERT INTO sync_cursor')
        })
        expect(insertCall).toBeUndefined()
      })
    })

    describe('and the pointer-changes fetch throws', () => {
      beforeEach(() => {
        jest.useFakeTimers()
        fetcher.fetch.mockRejectedValueOnce(new Error('network down'))
      })

      it('should not throw from start and should retry on the next scheduled tick', async () => {
        catalystSync = await createComponent()
        await expect(startCatalystSync(catalystSync)).resolves.toBeUndefined()

        expect(fetcher.fetch).toHaveBeenCalledTimes(1)

        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({ ok: true, json: jest.fn().mockResolvedValue({ deltas: [] }) })
        )
        await jest.advanceTimersByTimeAsync(60_000)

        expect(fetcher.fetch).toHaveBeenCalledTimes(2)

        await stopCatalystSync(catalystSync)
      })
    })
  })

  describe('when starting with no persisted cursor', () => {
    beforeEach(() => {
      pg.query.mockResolvedValueOnce({ rows: [] } as never)
    })

    it('should run the one-time snapshots bootstrap before polling', async () => {
      fetcher.fetch
        .mockResolvedValueOnce(mockResponse({ ok: true, json: jest.fn().mockResolvedValue([]) }))
        .mockResolvedValueOnce(mockResponse({ ok: true, json: jest.fn().mockResolvedValue({ deltas: [] }) }))
      pg.query.mockResolvedValueOnce({ rows: [] } as never)

      catalystSync = await createComponent()
      await startCatalystSync(catalystSync)

      expect(fetcher.fetch).toHaveBeenNthCalledWith(1, `${contentUrl}/snapshots`, expect.anything())
    })

    describe('and the snapshot content file has a scene entry', () => {
      let scene: ReturnType<typeof buildScene>

      beforeEach(async () => {
        scene = buildScene()

        fetcher.fetch
          .mockResolvedValueOnce(
            mockResponse({
              ok: true,
              json: jest
                .fn()
                .mockResolvedValue([{ hash: 'bafy-snapshot-1', timeRange: { initTimestamp: 0, endTimestamp: 500 } }])
            })
          )
          .mockResolvedValueOnce(
            mockResponse({
              ok: true,
              text: jest
                .fn()
                .mockResolvedValue(
                  `${JSON.stringify({ entityId, entityType: 'scene', pointers: [PARCELS.GENESIS_CITY] })}\n`
                )
            })
          )
          .mockResolvedValueOnce(mockResponse({ ok: true, json: jest.fn().mockResolvedValue({ deltas: [] }) }))
        catalystContent.getActiveSceneEntity.mockResolvedValueOnce(scene)
        pg.query.mockResolvedValueOnce({ rows: [] } as never)

        catalystSync = await createComponent()
        await startCatalystSync(catalystSync)
      })

      it('should download the snapshot content file by hash', () => {
        expect(fetcher.fetch).toHaveBeenNthCalledWith(2, `${contentUrl}/contents/bafy-snapshot-1`, expect.anything())
      })

      it('should upsert the scene found in the snapshot content file', () => {
        expect(sceneLogsAccess.upsertForScene).toHaveBeenCalledWith(
          expect.objectContaining({ sceneId: scene.sceneId, realmKind: 'genesis' })
        )
      })

      it('should persist the cursor as the snapshot time range end', () => {
        const insertCall = pg.query.mock.calls.find(call => {
          const statement = call[0] as unknown as { text: string }
          return statement.text.includes('INSERT INTO sync_cursor')
        })
        const statement = insertCall?.[0] as unknown as { values: unknown[] }
        expect(statement.values).toContain('500')
      })
    })
  })
})
