import { type Identity, createTestIdentity, makeAuthenticatedRequest } from './utils/auth'
import { test } from '../components'

test('Get World Storage Controller', function ({ components, stubComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when getting a world storage value', () => {
    let key: string
    let identity: Identity

    beforeEach(async () => {
      key = 'my-key'
      identity = await createTestIdentity()
    })

    describe('and the request does not include an identity', () => {
      let response: Awaited<ReturnType<typeof components.localFetch.fetch>>

      beforeEach(async () => {
        response = await makeRequest(undefined, `/values/${key}`, 'GET')
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

    describe('and the value does not exist', () => {
      beforeEach(async () => {
        await makeRequest(identity, `/values/${key}`, 'DELETE')
      })

      it('should respond with a 404 and a not found message', async () => {
        const response = await makeRequest(identity, `/values/${key}`, 'GET')
        expect(response.status).toBe(404)
        const body = await response.json()
        expect(body).toEqual({
          message: 'Value not found'
        })
      })
    })

    describe('and the value exists', () => {
      let storedValue: string

      beforeEach(async () => {
        storedValue = 'stored-value'
        await makeRequest(identity, `/values/${key}`, 'PUT', { value: storedValue })
      })

      afterEach(async () => {
        await makeRequest(identity, `/values/${key}`, 'DELETE')
      })

      it('should respond with a 200 and the stored value', async () => {
        const response = await makeRequest(identity, `/values/${key}`, 'GET')
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          value: storedValue
        })
      })
    })

    describe('and the database throws an error', () => {
      beforeEach(() => {
        stubComponents.worldStorage.getValue.rejects(new Error('boom'))
      })

      afterEach(() => {
        stubComponents.worldStorage.getValue.reset()
      })

      it('should respond with a 500 and the error message', async () => {
        const response = await makeRequest(identity, `/values/${key}`, 'GET')
        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body).toEqual({
          message: 'boom'
        })
      })
    })
  })
})
