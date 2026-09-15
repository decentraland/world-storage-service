import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { NotAuthorizedError } from '@dcl/http-commons'
import { getCollaboratorHandler } from '../../../../src/controllers/handlers/collaborator/get-collaborator'
import { createLogsMockedComponent } from '../../../mocks/components'
import type {
  CollaboratorScene,
  ISceneCollaboratorsComponent
} from '../../../../src/adapters/scene-collaborators/types'
import type { HandlerContextWithPath } from '../../../../src/types'

describe('getCollaboratorHandler', () => {
  let sceneCollaborators: jest.Mocked<ISceneCollaboratorsComponent>
  let ctx: Pick<HandlerContextWithPath<'sceneCollaborators' | 'logs', '/collaborator'>, 'url' | 'components'> &
    DecentralandSignatureContext<Record<string, unknown>>
  let scenes: CollaboratorScene[]

  beforeEach(() => {
    sceneCollaborators = {
      upsertForScene: jest.fn(),
      touch: jest.fn(),
      removeScene: jest.fn(),
      removeByWorld: jest.fn(),
      listByAddress: jest.fn()
    }

    ctx = {
      url: new URL('http://localhost/collaborator'),
      components: {
        sceneCollaborators,
        logs: createLogsMockedComponent()
      },
      verification: { auth: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12', authMetadata: {} }
    }
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('when the request has no signer address', () => {
    beforeEach(() => {
      ctx.verification = undefined
    })

    it('should throw a NotAuthorizedError', async () => {
      await expect(getCollaboratorHandler(ctx)).rejects.toThrow(NotAuthorizedError)
    })
  })

  describe('when the request is signed', () => {
    beforeEach(() => {
      scenes = [
        {
          worldName: 'example.eth',
          baseParcel: '0,0',
          sceneId: 'bafybei-scene',
          title: 'Example Scene',
          realmKind: 'world'
        }
      ]

      sceneCollaborators.listByAddress.mockResolvedValue({ data: scenes, total: 1 })
    })

    it('should query listByAddress with the lowercased signer address', async () => {
      await getCollaboratorHandler(ctx)

      expect(sceneCollaborators.listByAddress).toHaveBeenCalledWith(
        '0xabcdef1234567890abcdef1234567890abcdef12',
        expect.any(Number),
        expect.any(Number)
      )
    })

    it('should query listByAddress with the parsed pagination parameters', async () => {
      ctx.url = new URL('http://localhost/collaborator?limit=10&offset=5')

      await getCollaboratorHandler(ctx)

      expect(sceneCollaborators.listByAddress).toHaveBeenCalledWith(expect.any(String), 10, 5)
    })

    it('should return the scenes with a paginated response shape', async () => {
      const response = await getCollaboratorHandler(ctx)

      expect(response).toEqual({
        status: 200,
        body: {
          data: scenes,
          pagination: { limit: 100, offset: 0, total: 1 }
        }
      })
    })

    it('should never derive the signer address from the request instead of the signature verification', async () => {
      ctx.url = new URL('http://localhost/collaborator?address=0x0000000000000000000000000000000000dead')

      await getCollaboratorHandler(ctx)

      expect(sceneCollaborators.listByAddress).toHaveBeenCalledWith(
        '0xabcdef1234567890abcdef1234567890abcdef12',
        expect.any(Number),
        expect.any(Number)
      )
    })
  })
})
