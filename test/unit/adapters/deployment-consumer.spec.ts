import type { IFetchComponent } from '@dcl/core-commons'
import { createConfigMockedComponent, createFetchMockedComponent } from '@dcl/core-commons'
import type { IQueueConsumerComponent } from '@dcl/queue-consumer-component'
import { Events } from '@dcl/schemas'
import { createDeploymentConsumerComponent } from '../../../src/adapters/deployment-consumer'
import { ADDRESSES, WORLD_NAMES } from '../../fixtures'
import {
  createLogsMockedComponent,
  createMetricsMockedComponent,
  createSceneEntityMockedComponent,
  createWorldSourcesMockedComponent
} from '../../mocks/components'
import type { ISceneCollaboratorsComponent } from '../../../src/adapters/scene-collaborators/types'
import type { IWorldSourcesComponent } from '../../../src/adapters/world-sources/types'
import type { WorldScene } from '../../../src/adapters/worlds-content-server/types'

type MessageHandler = (event: unknown) => Promise<void>

describe('DeploymentConsumerComponent', () => {
  const worldsContentServerUrl = 'https://worlds-content-server.decentraland.org'
  const contentUrl = 'https://peer.decentraland.org/content'
  const FETCH_OPTIONS = { timeout: 5000, attempts: 3, retryDelay: 200 }
  const SOURCE_FETCH_OPTIONS = { ...FETCH_OPTIONS, redirect: 'error' }
  const devSource = 'https://worlds-content-server.dcl.dev'
  const entityId = 'entity-1'
  const eventTimestamp = 1700000000000
  const allowedWorldsContentServerHosts = ' Worlds-Content-Server.dcl.dev'

  let fetcher: jest.Mocked<IFetchComponent>
  let queueConsumer: jest.Mocked<IQueueConsumerComponent>
  let sceneCollaborators: jest.Mocked<ISceneCollaboratorsComponent>
  let worldSources: jest.Mocked<IWorldSourcesComponent>
  let metrics: ReturnType<typeof createMetricsMockedComponent>
  let handlers: Map<string, MessageHandler>

  function mockResponse(response: Partial<Response>): Response {
    return response as Response
  }

  function buildScene(overrides: Partial<WorldScene> = {}): WorldScene {
    return {
      sceneId: overrides.sceneId ?? entityId,
      base: overrides.base ?? '0,0',
      parcels: overrides.parcels ?? ['0,0'],
      title: overrides.title === undefined ? 'My Scene' : overrides.title,
      deployedAt: overrides.deployedAt ?? 0,
      logsPermissions: overrides.logsPermissions ?? [ADDRESSES.AUTHORIZED.toLowerCase()]
    }
  }

  function deploymentHandler(): MessageHandler {
    const handler = handlers.get(`${Events.Type.WORLD}:${Events.SubType.Worlds.DEPLOYMENT}`)
    if (!handler) throw new Error('deployment handler was not registered')
    return handler
  }

  function scenesUndeploymentHandler(): MessageHandler {
    const handler = handlers.get(`${Events.Type.WORLD}:${Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT}`)
    if (!handler) throw new Error('world_scenes_undeployment handler was not registered')
    return handler
  }

  function worldUndeploymentHandler(): MessageHandler {
    const handler = handlers.get(`${Events.Type.WORLD}:${Events.SubType.Worlds.WORLD_UNDEPLOYMENT}`)
    if (!handler) throw new Error('world_undeployment handler was not registered')
    return handler
  }

  function catalystDeploymentHandler(): MessageHandler {
    const handler = handlers.get(`${Events.Type.CATALYST_DEPLOYMENT}:${Events.SubType.CatalystDeployment.SCENE}`)
    if (!handler) throw new Error('catalyst scene deployment handler was not registered')
    return handler
  }

  beforeEach(async () => {
    handlers = new Map()

    fetcher = createFetchMockedComponent() as jest.Mocked<IFetchComponent>
    queueConsumer = {
      addMessageHandler: jest.fn((type: string, subType: string, handler: MessageHandler) => {
        handlers.set(`${type}:${subType}`, handler)
      }),
      removeMessageHandler: jest.fn()
    } as unknown as jest.Mocked<IQueueConsumerComponent>
    sceneCollaborators = {
      upsertForScene: jest.fn(),
      insert: jest.fn(),
      removeByScene: jest.fn(),
      removeByWorld: jest.fn(),
      listByAddress: jest.fn()
    }
    worldSources = createWorldSourcesMockedComponent()
    metrics = createMetricsMockedComponent()

    await createDeploymentConsumerComponent({
      config: createConfigMockedComponent({
        requireString: jest
          .fn()
          .mockImplementation(async (key: string) => (key === 'CONTENT_URL' ? contentUrl : worldsContentServerUrl)),
        getString: jest
          .fn()
          .mockImplementation(async (key: string) =>
            key === 'ALLOWED_WORLDS_CONTENT_SERVER_HOSTS' ? allowedWorldsContentServerHosts : undefined
          )
      }),
      logs: createLogsMockedComponent(),
      metrics,
      fetcher,
      queueConsumer,
      sceneCollaborators,
      sceneEntity: await createSceneEntityMockedComponent(),
      worldSources
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when a deployment event is received', () => {
    function mockEntityFetch(scene: WorldScene): void {
      fetcher.fetch.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: jest.fn().mockResolvedValue({
            type: 'scene',
            pointers: scene.parcels,
            metadata: {
              worldConfiguration: { name: WORLD_NAMES.DEFAULT },
              scene: { base: scene.base, parcels: scene.parcels },
              display: { title: scene.title },
              logsPermissions: scene.logsPermissions
            }
          })
        })
      )
    }

    describe('and the deployed scene has logsPermissions', () => {
      let scene: WorldScene

      beforeEach(() => {
        scene = buildScene({
          logsPermissions: [ADDRESSES.AUTHORIZED.toLowerCase(), ADDRESSES.ANOTHER_AUTHORIZED.toLowerCase()]
        })
        mockEntityFetch(scene)
      })

      it('should fetch the deployed entity from the configured worlds content server', async () => {
        await deploymentHandler()({ entity: { entityId } })

        expect(fetcher.fetch).toHaveBeenCalledWith(`${worldsContentServerUrl}/contents/${entityId}`, FETCH_OPTIONS)
      })

      it('should upsert the scene resolved from the deployed entity with its lowercased addresses', async () => {
        await deploymentHandler()({ entity: { entityId } })

        expect(sceneCollaborators.upsertForScene).toHaveBeenCalledWith({
          worldName: WORLD_NAMES.DEFAULT,
          baseParcel: scene.base,
          sceneId: scene.sceneId,
          title: scene.title,
          realmKind: 'world',
          deployedAt: 0,
          addresses: scene.logsPermissions,
          sourceContentServerUrl: null
        })
      })
    })

    describe('and the deployed scene has no logsPermissions', () => {
      beforeEach(() => {
        mockEntityFetch(buildScene({ logsPermissions: [] }))
      })

      it('should upsert the scene with an empty address set', async () => {
        await deploymentHandler()({ entity: { entityId } })

        expect(sceneCollaborators.upsertForScene).toHaveBeenCalledWith(expect.objectContaining({ addresses: [] }))
      })
    })

    describe('and the deployed entity fetch returns a server error', () => {
      beforeEach(() => {
        fetcher.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 500, statusText: 'error' }))
      })

      it('should discard the event without upserting or rejecting', async () => {
        await expect(deploymentHandler()({ entity: { entityId } })).resolves.toBeUndefined()

        expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
      })
    })

    describe('and the deployed entity fetch throws a network error', () => {
      beforeEach(() => {
        fetcher.fetch.mockRejectedValueOnce(new Error('network down'))
      })

      it('should discard the event without upserting or rejecting', async () => {
        await expect(deploymentHandler()({ entity: { entityId } })).resolves.toBeUndefined()

        expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
      })
    })

    describe('and the deployed entity is not found', () => {
      beforeEach(() => {
        fetcher.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 404, statusText: 'not found' }))
      })

      it('should discard the event without upserting or rejecting', async () => {
        await expect(deploymentHandler()({ entity: { entityId } })).resolves.toBeUndefined()

        expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
      })
    })
  })

  describe('when a deployment event is received with a source content server', () => {
    let event: Record<string, unknown>

    beforeEach(() => {
      fetcher.fetch.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: jest.fn().mockResolvedValue({
            type: 'scene',
            pointers: ['0,0'],
            metadata: {
              worldConfiguration: { name: WORLD_NAMES.DEFAULT },
              scene: { base: '0,0', parcels: ['0,0'] }
            }
          })
        })
      )
    })

    describe('and the sourceContentServerUrl attribute is allowlisted and matches contentServerUrls', () => {
      beforeEach(() => {
        event = {
          entity: { entityId },
          contentServerUrls: [`${devSource}/`],
          __messageAttributes: { sourceContentServerUrl: devSource }
        }
      })

      it('should fetch the deployed entity from the source server refusing redirects', async () => {
        await deploymentHandler()(event)

        expect(fetcher.fetch).toHaveBeenCalledWith(`${devSource}/contents/${entityId}`, SOURCE_FETCH_OPTIONS)
      })

      it('should upsert the scene recording the source server', async () => {
        await deploymentHandler()(event)

        expect(sceneCollaborators.upsertForScene).toHaveBeenCalledWith(
          expect.objectContaining({
            worldName: WORLD_NAMES.DEFAULT,
            sceneId: entityId,
            realmKind: 'world',
            sourceContentServerUrl: devSource
          })
        )
      })

      it('should record the source server as the world source', async () => {
        await deploymentHandler()(event)

        expect(worldSources.recordDeployment).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, devSource, 0)
      })
    })

    describe('and the sourceContentServerUrl attribute is the default server, which is not allowlisted', () => {
      beforeEach(() => {
        event = {
          entity: { entityId },
          contentServerUrls: [worldsContentServerUrl],
          __messageAttributes: { sourceContentServerUrl: `${worldsContentServerUrl}/` }
        }
      })

      it('should fetch the deployed entity from the configured worlds content server', async () => {
        await deploymentHandler()(event)

        expect(fetcher.fetch).toHaveBeenCalledWith(`${worldsContentServerUrl}/contents/${entityId}`, FETCH_OPTIONS)
      })

      it('should record a null world source', async () => {
        await deploymentHandler()(event)

        expect(worldSources.recordDeployment).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, null, 0)
      })
    })

    describe('and contentServerUrls names a different origin than the attribute', () => {
      beforeEach(() => {
        event = {
          entity: { entityId },
          contentServerUrls: [worldsContentServerUrl],
          __messageAttributes: { sourceContentServerUrl: devSource }
        }
      })

      it('should drop the deployment without fetching it', async () => {
        await deploymentHandler()(event)

        expect(fetcher.fetch).not.toHaveBeenCalled()
      })

      it('should count the drop as a source mismatch', async () => {
        await deploymentHandler()(event)

        expect(metrics.increment).toHaveBeenCalledWith('world_storage_world_events_dropped_total', {
          sub_type: Events.SubType.Worlds.DEPLOYMENT,
          reason: 'source_mismatch'
        })
      })
    })

    describe('and the sourceContentServerUrl attribute host is not allowlisted', () => {
      beforeEach(() => {
        event = {
          entity: { entityId },
          contentServerUrls: ['https://attacker.example.com'],
          __messageAttributes: { sourceContentServerUrl: 'https://attacker.example.com' }
        }
      })

      it('should drop the deployment without fetching it', async () => {
        await deploymentHandler()(event)

        expect(fetcher.fetch).not.toHaveBeenCalled()
      })

      it('should count the drop as not allowlisted', async () => {
        await deploymentHandler()(event)

        expect(metrics.increment).toHaveBeenCalledWith('world_storage_world_events_dropped_total', {
          sub_type: Events.SubType.Worlds.DEPLOYMENT,
          reason: 'not_allowlisted'
        })
      })
    })

    describe('and the sourceContentServerUrl attribute carries a path', () => {
      beforeEach(() => {
        event = {
          entity: { entityId },
          contentServerUrls: [`${devSource}/worlds`],
          __messageAttributes: { sourceContentServerUrl: `${devSource}/worlds` }
        }
      })

      it('should drop the deployment without upserting it', async () => {
        await deploymentHandler()(event)

        expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
      })
    })

    describe('and there is no attribute but contentServerUrls names an allowlisted server', () => {
      beforeEach(() => {
        event = { entity: { entityId }, contentServerUrls: [devSource] }
      })

      it('should fetch the deployed entity from the configured worlds content server', async () => {
        await deploymentHandler()(event)

        expect(fetcher.fetch).toHaveBeenCalledWith(`${worldsContentServerUrl}/contents/${entityId}`, FETCH_OPTIONS)
      })

      it('should record a null world source', async () => {
        await deploymentHandler()(event)

        expect(worldSources.recordDeployment).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, null, 0)
      })
    })
  })

  describe('when a malformed deployment event is received', () => {
    it('should not throw and should not upsert any scene', async () => {
      await expect(deploymentHandler()({ entity: {} })).resolves.toBeUndefined()

      expect(fetcher.fetch).not.toHaveBeenCalled()
      expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
    })
  })

  describe('when a world_scenes_undeployment event is received', () => {
    it('should remove every affected scene by id', async () => {
      await scenesUndeploymentHandler()({
        metadata: {
          worldName: WORLD_NAMES.DEFAULT,
          scenes: [
            { entityId: 'scene-a', baseParcel: '0,0' },
            { entityId: 'scene-b', baseParcel: '1,1' }
          ]
        }
      })

      expect(sceneCollaborators.removeByScene).toHaveBeenCalledWith('scene-a', null)
      expect(sceneCollaborators.removeByScene).toHaveBeenCalledWith('scene-b', null)
      expect(sceneCollaborators.removeByScene).toHaveBeenCalledTimes(2)
    })

    describe('and the event has a malformed scenes field', () => {
      it('should not throw and should not remove any scene', async () => {
        await expect(
          scenesUndeploymentHandler()({ metadata: { worldName: WORLD_NAMES.DEFAULT } })
        ).resolves.toBeUndefined()

        expect(sceneCollaborators.removeByScene).not.toHaveBeenCalled()
      })
    })

    describe('and removing a scene fails transiently', () => {
      beforeEach(() => {
        sceneCollaborators.removeByScene.mockRejectedValueOnce(new Error('db unavailable'))
      })

      it('should reject so the undeployment is not acknowledged as processed', async () => {
        await expect(
          scenesUndeploymentHandler()({
            metadata: { worldName: WORLD_NAMES.DEFAULT, scenes: [{ entityId: 'scene-a' }] }
          })
        ).rejects.toThrow()
      })
    })
  })

  describe('when a world_undeployment event is received', () => {
    it('should remove every scene_collaborators row for the world', async () => {
      await worldUndeploymentHandler()({ metadata: { worldName: WORLD_NAMES.DEFAULT } })

      expect(sceneCollaborators.removeByWorld).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, null)
    })

    describe('and the event has a missing worldName', () => {
      it('should not throw and should not remove anything', async () => {
        await expect(worldUndeploymentHandler()({ metadata: {} })).resolves.toBeUndefined()

        expect(sceneCollaborators.removeByWorld).not.toHaveBeenCalled()
      })
    })

    describe('and removing the world rows fails transiently', () => {
      beforeEach(() => {
        sceneCollaborators.removeByWorld.mockRejectedValueOnce(new Error('db unavailable'))
      })

      it('should reject so the undeployment is not acknowledged as processed', async () => {
        await expect(worldUndeploymentHandler()({ metadata: { worldName: WORLD_NAMES.DEFAULT } })).rejects.toThrow()
      })
    })
  })

  describe('when an undeployment event carries a sourceContentServerUrl attribute', () => {
    let attributes: Record<string, string>

    describe('and the source is allowlisted', () => {
      beforeEach(() => {
        attributes = { sourceContentServerUrl: 'HTTPS://Worlds-Content-Server.DCL.dev/' }
      })

      it('should remove only the world rows from that source', async () => {
        await worldUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT },
          __messageAttributes: attributes
        })

        expect(sceneCollaborators.removeByWorld).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          'https://worlds-content-server.dcl.dev'
        )
      })

      it('should forget the world source only when it is that source', async () => {
        await worldUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT },
          __messageAttributes: attributes
        })

        expect(worldSources.removeIfSource).toHaveBeenCalledWith(
          WORLD_NAMES.DEFAULT,
          'https://worlds-content-server.dcl.dev'
        )
      })

      it('should remove the undeployed scenes only from that source', async () => {
        await scenesUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT, scenes: [{ entityId: 'scene-a' }] },
          __messageAttributes: attributes
        })

        expect(sceneCollaborators.removeByScene).toHaveBeenCalledWith(
          'scene-a',
          'https://worlds-content-server.dcl.dev'
        )
      })
    })

    describe('and the source is the default worlds content server, which is not allowlisted', () => {
      beforeEach(() => {
        attributes = { sourceContentServerUrl: worldsContentServerUrl }
      })

      it('should remove the world rows with a null source', async () => {
        await worldUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT },
          __messageAttributes: attributes
        })

        expect(sceneCollaborators.removeByWorld).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT, null)
      })
    })

    describe('and the source host is not allowlisted', () => {
      beforeEach(() => {
        attributes = { sourceContentServerUrl: 'https://attacker.example.com' }
      })

      it('should drop the world undeployment without removing rows', async () => {
        await worldUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT },
          __messageAttributes: attributes
        })

        expect(sceneCollaborators.removeByWorld).not.toHaveBeenCalled()
      })

      it('should drop the scenes undeployment without removing rows', async () => {
        await scenesUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT, scenes: [{ entityId: 'scene-a' }] },
          __messageAttributes: attributes
        })

        expect(sceneCollaborators.removeByScene).not.toHaveBeenCalled()
      })
    })

    describe('and the source has a path on an allowlisted host', () => {
      beforeEach(() => {
        attributes = { sourceContentServerUrl: `${devSource}/worlds-content-server` }
      })

      it('should drop the world undeployment without removing rows', async () => {
        await worldUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT },
          __messageAttributes: attributes
        })

        expect(sceneCollaborators.removeByWorld).not.toHaveBeenCalled()
      })

      it('should count the drop as not a bare origin', async () => {
        await worldUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT },
          __messageAttributes: attributes
        })

        expect(metrics.increment).toHaveBeenCalledWith('world_storage_world_events_dropped_total', {
          sub_type: Events.SubType.Worlds.WORLD_UNDEPLOYMENT,
          reason: 'not_bare_origin'
        })
      })
    })

    describe('and the source is an allowlisted host over plain HTTP', () => {
      beforeEach(() => {
        attributes = { sourceContentServerUrl: 'http://worlds-content-server.dcl.dev' }
      })

      it('should drop the world undeployment without removing rows', async () => {
        await worldUndeploymentHandler()({
          metadata: { worldName: WORLD_NAMES.DEFAULT },
          __messageAttributes: attributes
        })

        expect(sceneCollaborators.removeByWorld).not.toHaveBeenCalled()
      })
    })
  })

  describe('when a catalyst scene deployment event is received', () => {
    function buildCatalystEvent(scene: WorldScene): { entity: unknown; authChain: unknown } {
      return {
        entity: {
          id: scene.sceneId,
          type: 'scene',
          pointers: scene.parcels,
          metadata: {
            scene: { base: scene.base, parcels: scene.parcels },
            display: { title: scene.title },
            logsPermissions: scene.logsPermissions
          }
        },
        authChain: []
      }
    }

    describe('and the deployed scene has logsPermissions', () => {
      let scene: WorldScene

      beforeEach(() => {
        scene = buildScene({
          logsPermissions: [ADDRESSES.AUTHORIZED.toLowerCase(), ADDRESSES.ANOTHER_AUTHORIZED.toLowerCase()]
        })
      })

      it('should upsert the scene from the embedded entity as genesis without fetching', async () => {
        await catalystDeploymentHandler()(buildCatalystEvent(scene))

        expect(fetcher.fetch).not.toHaveBeenCalled()
        expect(sceneCollaborators.upsertForScene).toHaveBeenCalledWith({
          sceneId: scene.sceneId,
          worldName: 'main',
          baseParcel: scene.base,
          title: scene.title,
          realmKind: 'genesis',
          deployedAt: 0,
          addresses: scene.logsPermissions
        })
      })
    })

    describe('and the event carries the catalyst bus entity shape', () => {
      let scene: WorldScene
      let event: unknown

      beforeEach(() => {
        scene = buildScene({ sceneId: 'bafkrei-bus-scene' })
        event = {
          key: scene.sceneId,
          timestamp: eventTimestamp,
          entity: {
            entityId: scene.sceneId,
            entityType: 'scene',
            authChain: [],
            metadata: {
              scene: { base: scene.base, parcels: scene.parcels },
              display: { title: scene.title },
              logsPermissions: scene.logsPermissions
            }
          }
        }
      })

      it('should upsert the scene as genesis using the entityId and the event timestamp', async () => {
        await catalystDeploymentHandler()(event)

        expect(sceneCollaborators.upsertForScene).toHaveBeenCalledWith({
          sceneId: scene.sceneId,
          worldName: 'main',
          baseParcel: scene.base,
          title: scene.title,
          realmKind: 'genesis',
          deployedAt: eventTimestamp,
          addresses: scene.logsPermissions
        })
      })

      it('should not fetch the entity because the event already embeds its metadata', async () => {
        await catalystDeploymentHandler()(event)

        expect(fetcher.fetch).not.toHaveBeenCalled()
      })
    })

    describe('and the event entity carries no metadata', () => {
      let scene: WorldScene
      let event: unknown

      beforeEach(() => {
        scene = buildScene({ sceneId: 'bafkrei-metadataless-scene', deployedAt: 1690000000000 })
        event = {
          key: scene.sceneId,
          timestamp: eventTimestamp,
          entity: { entityId: scene.sceneId, entityType: 'scene', authChain: [] }
        }
        fetcher.fetch.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            json: jest.fn().mockResolvedValue({
              type: 'scene',
              timestamp: scene.deployedAt,
              pointers: scene.parcels,
              metadata: {
                scene: { base: scene.base, parcels: scene.parcels },
                display: { title: scene.title },
                logsPermissions: scene.logsPermissions
              }
            })
          })
        )
      })

      it('should refetch the entity from the configured catalyst content server', async () => {
        await catalystDeploymentHandler()(event)

        expect(fetcher.fetch).toHaveBeenCalledWith(`${contentUrl}/contents/${scene.sceneId}`, FETCH_OPTIONS)
      })

      it('should upsert the scene resolved from the refetched entity with its own deployment timestamp', async () => {
        await catalystDeploymentHandler()(event)

        expect(sceneCollaborators.upsertForScene).toHaveBeenCalledWith({
          sceneId: scene.sceneId,
          worldName: 'main',
          baseParcel: scene.base,
          title: scene.title,
          realmKind: 'genesis',
          deployedAt: scene.deployedAt,
          addresses: scene.logsPermissions
        })
      })
    })

    describe('and the entity refetch does not yield a scene', () => {
      beforeEach(() => {
        fetcher.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 404, statusText: 'not found' }))
      })

      it('should discard the event without upserting or rejecting', async () => {
        await expect(
          catalystDeploymentHandler()({ key: entityId, entity: { entityId, entityType: 'scene', authChain: [] } })
        ).resolves.toBeUndefined()

        expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
      })
    })

    describe('and the event carries no resolvable entity id', () => {
      it('should discard the event without fetching, upserting or rejecting', async () => {
        await expect(catalystDeploymentHandler()({ entity: { entityType: 'scene' } })).resolves.toBeUndefined()

        expect(fetcher.fetch).not.toHaveBeenCalled()
        expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
      })
    })
  })
})
