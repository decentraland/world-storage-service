import type { AuthIdentity } from '@dcl/crypto'
import { signedFetchFactory } from 'decentraland-crypto-fetch'
import { createTestIdentity } from './utils/auth'
import { createLocalFetchWrapper } from './utils/fetch'
import { test } from '../components'

test('Delete Player Storage Controller', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string

  describe('when deleting a player storage value', () => {
    let key: string
    let playerAddress: string
    let identity: AuthIdentity
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      key = 'my-key'
      playerAddress = '0x1234567890abcdef1234567890abcdef12345678'
      identity = await createTestIdentity()
      const host = await components.config.requireString('HTTP_SERVER_HOST')
      const port = await components.config.requireNumber('HTTP_SERVER_PORT')
      baseUrl = `http://${host}:${port}`
      signedFetch = signedFetchFactory({ fetch: createLocalFetchWrapper(components.localFetch) })
    })

    describe('and the request does not include an identity', () => {
      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, { method: 'DELETE' })
      })

      it('should respond with a 400 and a signed fetch required message', async () => {
        const body = await response.json()
        expect(response.status).toBe(400)
        expect(body).toEqual({
          error: 'Invalid Auth Chain',
          message: 'This endpoint requires a signed fetch request. See ADR-44.'
        })
      })
    })

    describe('and the delete succeeds', () => {
      let storedValue: string

      beforeEach(async () => {
        storedValue = 'to-delete'
        await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: storedValue }),
          identity
        })
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'DELETE',
          identity
        })
      })

      it('should delete the value and respond with a 204', async () => {
        const getResponse = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'GET',
          identity
        })
        const body = await getResponse.json()
        expect(response.status).toBe(204)
        expect(getResponse.status).toBe(404)
        expect(body).toEqual({
          message: 'Value not found'
        })
      })
    })

    describe('and the storage delete throws an error', () => {
      beforeEach(async () => {
        stubComponents.playerStorage.deleteValue.rejects(new Error('boom'))
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'DELETE',
          identity
        })
      })

      afterEach(() => {
        stubComponents.playerStorage.deleteValue.reset()
      })

      it('should respond with a 500 and the error message', async () => {
        const body = await response.json()
        expect(response.status).toBe(500)
        expect(body).toEqual({
          message: 'boom'
        })
      })
    })
  })
})
