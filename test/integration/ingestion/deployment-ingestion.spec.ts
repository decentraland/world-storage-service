import { CreateQueueCommand, PurgeQueueCommand, SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { START_COMPONENT, STOP_COMPONENT } from '@well-known-components/interfaces'
import type { AuthIdentity } from '@dcl/crypto'
import type { IQueueConsumerComponent } from '@dcl/queue-consumer-component'
import { createQueueConsumerComponent } from '@dcl/queue-consumer-component'
import { Events } from '@dcl/schemas'
import type { IQueueComponent } from '@dcl/sqs-component'
import { createSqsComponent } from '@dcl/sqs-component'
import { createLocalFetchComponent, createRunner } from '@dcl/test-helpers'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { createDeploymentConsumerComponent } from '../../../src/adapters/deployment-consumer'
import { initComponents as originalInitComponents } from '../../../src/components'
import { main } from '../../../src/service'
import { PARCELS, WORLD_NAMES } from '../../fixtures'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'
import type { TestComponents } from '../../../src/types'

const LOCALSTACK_ENDPOINT = process.env.AWS_SQS_ENDPOINT ?? 'http://localhost:4566'
const QUEUE_NAME = 'world-storage-deployments'
const QUEUE_URL = `${LOCALSTACK_ENDPOINT}/000000000000/${QUEUE_NAME}`
const GENESIS_WORLD_NAME = 'main'

process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1'
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test'
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? 'test'

const sqsAdmin = new SQSClient({
  endpoint: LOCALSTACK_ENDPOINT,
  region: 'us-east-1',
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' }
})

let realSqs: IQueueComponent
let realConsumer: IQueueConsumerComponent

const ingestionTest = createRunner<TestComponents>({
  main,
  async initComponents() {
    const components = await originalInitComponents()

    realSqs = await createSqsComponent(
      createConfigComponent({ AWS_SQS_QUEUE_URL: QUEUE_URL, AWS_SQS_ENDPOINT: LOCALSTACK_ENDPOINT })
    )
    realConsumer = createQueueConsumerComponent({ sqs: realSqs, logs: components.logs })
    await createDeploymentConsumerComponent({
      config: components.config,
      logs: components.logs,
      fetcher: components.fetcher,
      queueConsumer: realConsumer,
      sceneCollaborators: components.sceneCollaborators
    })

    return { ...components, localFetch: await createLocalFetchComponent(components.config) }
  }
})

const describeIngestion: typeof ingestionTest =
  process.env.RUN_SQS_INTEGRATION === 'true'
    ? ingestionTest
    : (((name: string) => {
        describe.skip(name, () => {
          it('requires RUN_SQS_INTEGRATION=true and docker-compose localstack', () => undefined)
        })
      }) as unknown as typeof ingestionTest)

describeIngestion(
  'when ingesting deployment events from a real (localstack) SQS queue',
  function ({ components, stubComponents }) {
    let signedFetch: ReturnType<typeof signedFetchFactory>
    let baseUrl: string
    let identity: AuthIdentity
    let address: string
    let resetStubs: () => void

    async function waitForCollaboratorData(timeoutMs = 15000): Promise<Array<Record<string, unknown>>> {
      const deadline = Date.now() + timeoutMs
      let lastData: Array<Record<string, unknown>> = []
      while (Date.now() < deadline) {
        const response = await signedFetch(`${baseUrl}/collaborator`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const body = await response.json()
        lastData = body.data ?? []
        if (lastData.length > 0) {
          return lastData
        }
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      return lastData
    }

    beforeAll(async () => {
      await sqsAdmin.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }))
      await sqsAdmin.send(new PurgeQueueCommand({ QueueUrl: QUEUE_URL })).catch(() => undefined)
      const start = realConsumer[START_COMPONENT]
      if (start) {
        await start({ started: () => true, live: () => true, getComponents: () => ({}) })
      }
    })

    afterAll(async () => {
      const stop = realConsumer[STOP_COMPONENT]
      if (stop) {
        await stop()
      }
    })

    beforeEach(async () => {
      await components.sceneCollaborators.removeByWorld(GENESIS_WORLD_NAME)
      await components.sceneCollaborators.removeByWorld(WORLD_NAMES.DEFAULT)
      const setup = await createTestSetup(components, stubComponents)
      signedFetch = setup.signedFetch
      baseUrl = setup.baseUrl
      identity = setup.identity
      address = setup.address
      resetStubs = setup.resetStubs
    })

    afterEach(async () => {
      resetStubs()
      await components.sceneCollaborators.removeByWorld(GENESIS_WORLD_NAME)
      await components.sceneCollaborators.removeByWorld(WORLD_NAMES.DEFAULT)
    })

    describe('and a catalyst scene deployment lists the signed-in wallet in logsPermissions', () => {
      beforeEach(async () => {
        await sqsAdmin.send(
          new SendMessageCommand({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify({
              type: Events.Type.CATALYST_DEPLOYMENT,
              subType: Events.SubType.CatalystDeployment.SCENE,
              entity: {
                id: 'bafkrei-genesis-scene',
                type: 'scene',
                pointers: [PARCELS.SCENE_A],
                metadata: {
                  scene: { base: PARCELS.SCENE_A, parcels: [PARCELS.SCENE_A] },
                  display: { title: 'Genesis Scene' },
                  logsPermissions: [address.toLowerCase()]
                }
              },
              authChain: []
            })
          })
        )
      })

      it('should index the genesis scene so the wallet sees it via GET /collaborator', async () => {
        const data = await waitForCollaboratorData()
        expect(data).toEqual([
          {
            sceneId: 'bafkrei-genesis-scene',
            worldName: GENESIS_WORLD_NAME,
            baseParcel: PARCELS.SCENE_A,
            title: 'Genesis Scene',
            realmKind: 'genesis'
          }
        ])
      }, 20000)
    })

    describe('and a worlds-content-server deployment lists the signed-in wallet in logsPermissions', () => {
      let originalFetch: typeof components.fetcher.fetch

      beforeEach(async () => {
        originalFetch = components.fetcher.fetch
        components.fetcher.fetch = (async () => ({
          ok: true,
          json: async () => ({
            type: 'scene',
            pointers: [PARCELS.SCENE_B],
            metadata: {
              worldConfiguration: { name: WORLD_NAMES.DEFAULT },
              scene: { base: PARCELS.SCENE_B, parcels: [PARCELS.SCENE_B] },
              display: { title: 'World Scene' },
              logsPermissions: [address.toLowerCase()]
            }
          })
        })) as unknown as typeof components.fetcher.fetch

        await sqsAdmin.send(
          new SendMessageCommand({
            QueueUrl: QUEUE_URL,
            MessageBody: JSON.stringify({
              type: Events.Type.WORLD,
              subType: Events.SubType.Worlds.DEPLOYMENT,
              entity: { entityId: 'bafkrei-world-scene' }
            })
          })
        )
      })

      afterEach(() => {
        components.fetcher.fetch = originalFetch
      })

      it('should index the world scene so the wallet sees it via GET /collaborator', async () => {
        const data = await waitForCollaboratorData()
        expect(data).toEqual([
          {
            sceneId: 'bafkrei-world-scene',
            worldName: WORLD_NAMES.DEFAULT,
            baseParcel: PARCELS.SCENE_B,
            title: 'World Scene',
            realmKind: 'world'
          }
        ])
      }, 20000)
    })
  }
)
