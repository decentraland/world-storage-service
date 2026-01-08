import type { AuthIdentity } from '@dcl/crypto'
import { signedFetchFactory } from 'decentraland-crypto-fetch'
import { createTestIdentity } from './utils/auth'
import { createLocalFetchWrapper } from './utils/fetch'
import { test } from '../components'

test('Upsert World Storage Controller', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string

  describe('when upserting a world storage value', () => {
    let key: string
    let identity: AuthIdentity
    let response: Awaited<ReturnType<typeof signedFetch>>

    beforeEach(async () => {
      key = 'my-key'
      identity = await createTestIdentity()
      const host = await components.config.requireString('HTTP_SERVER_HOST')
      const port = await components.config.requireNumber('HTTP_SERVER_PORT')
      baseUrl = `http://${host}:${port}`
      signedFetch = signedFetchFactory({ fetch: createLocalFetchWrapper(components.localFetch) })
    })

    describe('and the request does not include an identity', () => {
      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/values/${key}`, {
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
        response = await signedFetch(`${baseUrl}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: invalidBody,
          identity
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
        response = await signedFetch(`${baseUrl}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
          identity
        })
      })

      it('should respond with a 400 and a missing value message', async () => {
        const body = await response.json()
        expect(response.status).toBe(400)
        expect(body.message).toEqual('Invalid JSON body')
      })
    })

    describe('and the value is provided', () => {
      let storedValue: unknown

      beforeEach(async () => {
        storedValue = { foo: 'bar' }
        response = await signedFetch(`${baseUrl}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: storedValue }),
          identity
        })
      })

      afterEach(async () => {
        await signedFetch(`${baseUrl}/values/${key}`, { method: 'DELETE', identity })
      })

      it('should store the value and respond with a 200', async () => {
        const body = await response.json()
        const getResponse = await signedFetch(`${baseUrl}/values/${key}`, { method: 'GET', identity })
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
        stubComponents.worldStorage.setValue.rejects(new Error('boom'))
        response = await signedFetch(`${baseUrl}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: 'payload' }),
          identity
        })
      })

      afterEach(() => {
        stubComponents.worldStorage.setValue.reset()
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
