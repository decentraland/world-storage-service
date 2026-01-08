import { type Identity, createTestIdentity, makeAuthenticatedRequest } from './utils/auth'
import { test } from '../components'

test('Upsert World Storage Controller', function ({ components, stubComponents }) {
  const makeRequest = makeAuthenticatedRequest(components)

  describe('when upserting a world storage value', () => {
    let key: string
    let identity: Identity
    let response: Awaited<ReturnType<typeof components.localFetch.fetch>>

    beforeEach(async () => {
      key = 'my-key'
      identity = await createTestIdentity()
    })

    describe('and the request does not include an identity', () => {
      beforeEach(async () => {
        response = await makeRequest(undefined, `/values/${key}`, 'PUT', { value: 'payload' })
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

    describe('and the request body is not valid JSON', () => {
      let invalidBody: string

      beforeEach(async () => {
        invalidBody = '{ "value": '
        response = await makeRequest(identity, `/values/${key}`, 'PUT', invalidBody)
      })

      it('should respond with a 400 and an invalid json message', async () => {
        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.message).toContain('Unexpected end of JSON input')
      })
    })

    describe('and the request body does not include a value', () => {
      beforeEach(async () => {
        response = await makeRequest(identity, `/values/${key}`, 'PUT', {})
      })

      it('should respond with a 400 and a missing value message', async () => {
        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body.message).toEqual('Invalid JSON body')
      })
    })

    describe('and the value is provided', () => {
      let storedValue: unknown

      beforeEach(async () => {
        storedValue = { foo: 'bar' }
        response = await makeRequest(identity, `/values/${key}`, 'PUT', { value: storedValue })
      })

      afterEach(async () => {
        await makeRequest(identity, `/values/${key}`, 'DELETE')
      })

      it('should respond with a 200 and the stored value', async () => {
        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body).toEqual({
          value: storedValue
        })
      })
    })

    describe('and the database throws an error', () => {
      beforeEach(async () => {
        stubComponents.worldStorage.setValue.rejects(new Error('boom'))
        response = await makeRequest(identity, `/values/${key}`, 'PUT', { value: 'payload' })
      })

      afterEach(() => {
        stubComponents.worldStorage.setValue.reset()
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
