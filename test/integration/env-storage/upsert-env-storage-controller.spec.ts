import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { test } from '../../components'
import { TEST_REALM_METADATA } from '../utils/auth'
import { createTestSetup } from '../utils/setup'

test('Upsert Env Storage Controller', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string

  describe('when upserting an env storage value', () => {
    let key: string
    let identity: AuthIdentity
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      key = 'MY_ENV_VAR'
      const setup = await createTestSetup(components)
      signedFetch = setup.signedFetch
      baseUrl = setup.baseUrl
      identity = setup.identity
    })

    describe('and the request does not include an identity', () => {
      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'payload' })
        })
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

    describe('and the request body is not valid JSON', () => {
      let invalidBody: string

      beforeEach(async () => {
        invalidBody = '{ "value": '
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: invalidBody,
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      it('should respond with a 400 and an invalid json message', async () => {
        const body = await response.json()
        expect(response.status).toBe(400)
        expect(body.message).toContain('Unexpected end of JSON input')
      })
    })

    describe('and the request body does not include a value', () => {
      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      it('should respond with a 400 and a missing value message', async () => {
        const body = await response.json()
        expect(response.status).toBe(400)
        expect(body.message).toEqual('Invalid JSON body')
      })
    })

    describe('and the value is not a string', () => {
      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 12345 }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      it('should respond with a 400 and an invalid value type message', async () => {
        const body = await response.json()
        expect(response.status).toBe(400)
        expect(body.message).toEqual('Invalid JSON body')
      })
    })

    describe('and the value is provided', () => {
      let storedValue: string

      beforeEach(async () => {
        storedValue = 'secret-api-key-12345'
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: storedValue }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      afterEach(async () => {
        await signedFetch(`${baseUrl}/env/${key}`, { method: 'DELETE', identity, metadata: TEST_REALM_METADATA })
      })

      it('should store the value and respond with a 200', async () => {
        const body = await response.json()
        const getResponse = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'GET',
          identity,
          metadata: TEST_REALM_METADATA
        })
        const getBody = await getResponse.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          value: storedValue
        })
        expect(getResponse.status).toBe(200)
        expect(getBody).toEqual({
          value: storedValue
        })
      })
    })

    describe('and the database throws an error', () => {
      beforeEach(async () => {
        stubComponents.envStorage.setValue.rejects(new Error('boom'))
        response = await signedFetch(`${baseUrl}/env/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'payload' }),
          identity,
          metadata: TEST_REALM_METADATA
        })
      })

      afterEach(() => {
        stubComponents.envStorage.setValue.reset()
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
