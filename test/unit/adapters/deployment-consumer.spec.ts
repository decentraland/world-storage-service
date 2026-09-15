import type { IFetchComponent } from '@dcl/core-commons'
import { createConfigMockedComponent, createFetchMockedComponent } from '@dcl/core-commons'
import type { IQueueConsumerComponent } from '@dcl/queue-consumer-component'
import { Events } from '@dcl/schemas'
import { createDeploymentConsumerComponent } from '../../../src/adapters/deployment-consumer'
import { ADDRESSES, WORLD_NAMES } from '../../fixtures'
import { createLogsMockedComponent } from '../../mocks/components'
import type { ISceneCollaboratorsComponent } from '../../../src/adapters/scene-collaborators/types'
import type { WorldScene } from '../../../src/adapters/worlds-content-server/types'

type MessageHandler = (event: unknown) => Promise<void>

describe('DeploymentConsumerComponent', () => {
  const worldsContentServerUrl = 'https://worlds-content-server.decentraland.org'
  const FETCH_OPTIONS = { timeout: 5000, attempts: 3, retryDelay: 200 }
  const entityId = 'entity-1'

  let fetcher: jest.Mocked<IFetchComponent>
  let queueConsumer: jest.Mocked<IQueueConsumerComponent>
  let sceneCollaborators: jest.Mocked<ISceneCollaboratorsComponent>
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
      touch: jest.fn(),
      removeScene: jest.fn(),
      removeByWorld: jest.fn(),
      listByAddress: jest.fn()
    }

    await createDeploymentConsumerComponent({
      config: createConfigMockedComponent({ requireString: jest.fn().mockResolvedValue(worldsContentServerUrl) }),
      logs: createLogsMockedComponent(),
      fetcher,
      queueConsumer,
      sceneCollaborators
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
          addresses: scene.logsPermissions
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

    describe('and the deployed entity fetch returns a retryable error', () => {
      beforeEach(() => {
        fetcher.fetch.mockResolvedValueOnce(mockResponse({ ok: false, status: 500, statusText: 'error' }))
      })

      it('should reject so the transient failure is not acknowledged as a success', async () => {
        await expect(deploymentHandler()({ entity: { entityId } })).rejects.toThrow()

        expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
      })
    })

    describe('and the deployed entity fetch throws a network error', () => {
      beforeEach(() => {
        fetcher.fetch.mockRejectedValueOnce(new Error('network down'))
      })

      it('should reject so the transient failure is not acknowledged as a success', async () => {
        await expect(deploymentHandler()({ entity: { entityId } })).rejects.toThrow()

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

      expect(sceneCollaborators.removeScene).toHaveBeenCalledWith('scene-a')
      expect(sceneCollaborators.removeScene).toHaveBeenCalledWith('scene-b')
      expect(sceneCollaborators.removeScene).toHaveBeenCalledTimes(2)
    })

    describe('and the event has a malformed scenes field', () => {
      it('should not throw and should not remove any scene', async () => {
        await expect(
          scenesUndeploymentHandler()({ metadata: { worldName: WORLD_NAMES.DEFAULT } })
        ).resolves.toBeUndefined()

        expect(sceneCollaborators.removeScene).not.toHaveBeenCalled()
      })
    })

    describe('and removing a scene fails transiently', () => {
      beforeEach(() => {
        sceneCollaborators.removeScene.mockRejectedValueOnce(new Error('db unavailable'))
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

      expect(sceneCollaborators.removeByWorld).toHaveBeenCalledWith(WORLD_NAMES.DEFAULT)
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

    describe('and the event carries a malformed entity', () => {
      it('should not throw and should not upsert', async () => {
        await expect(catalystDeploymentHandler()({ entity: { id: 'only-an-id' } })).resolves.toBeUndefined()

        expect(sceneCollaborators.upsertForScene).not.toHaveBeenCalled()
      })
    })
  })
})
