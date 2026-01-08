import { type Identity, createTestIdentity, makeAuthenticatedRequest } from './utils/auth'
import { test } from '../components'

test('Delete World Storage Controller', function ({ components, stubComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when deleting a world storage value', () => {
    let key: string
    let identity: Identity
    let response: Awaited<ReturnType<typeof components.localFetch.fetch>>

    beforeEach(async () => {
      key = 'my-key'
      identity = await createTestIdentity()
    })

    describe('and the request does not include an identity', () => {
      beforeEach(async () => {
        response = await makeRequest(undefined, `/values/${key}`, 'DELETE')
      })

      it('should respond with a 400 and a signed fetch required message', async () => {
        expect(response.status).toBe(400)
        const body = await response.json()
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
        await makeRequest(identity, `/values/${key}`, 'PUT', { value: storedValue })
        response = await makeRequest(identity, `/values/${key}`, 'DELETE')
      })

      it('should respond with a 204', () => {
        expect(response.status).toBe(204)
      })

      it('should have deleted the value', async () => {
        const getResponse = await makeRequest(identity, `/values/${key}`, 'GET')
        expect(getResponse.status).toBe(404)
        const body = await getResponse.json()
        expect(body).toEqual({
          message: 'Value not found'
        })
      })
    })

    describe('and the storage delete throws an error', () => {
      beforeEach(async () => {
        stubComponents.worldStorage.deleteValue.rejects(new Error('boom'))
        response = await makeRequest(identity, `/values/${key}`, 'DELETE')
      })

      afterEach(() => {
        stubComponents.worldStorage.deleteValue.reset()
      })

      it('should respond with a 500 and the error message', async () => {
        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body).toEqual({
          message: 'boom'
        })
      })
    })
  })
})
