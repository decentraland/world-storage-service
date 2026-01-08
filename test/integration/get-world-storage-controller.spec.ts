import type { AuthIdentity } from '@dcl/crypto'
import { signedFetchFactory } from 'decentraland-crypto-fetch'
import { createTestIdentity } from './utils/auth'
import { createLocalFetchWrapper } from './utils/fetch'
import { test } from '../components'

test('Get World Storage Controller', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string

  describe('when getting a world storage value', () => {
    let key: string
    let identity: AuthIdentity

    beforeEach(async () => {
      key = 'my-key'
      identity = await createTestIdentity()
      const host = await components.config.requireString('HTTP_SERVER_HOST')
      const port = await components.config.requireNumber('HTTP_SERVER_PORT')
      baseUrl = `http://${host}:${port}`
      signedFetch = signedFetchFactory({ fetch: createLocalFetchWrapper(components.localFetch) })
    })

    describe('and the request does not include an identity', () => {
      let response: Awaited<ReturnType<typeof signedFetch>>

      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/values/${key}`, { method: 'GET' })
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
        await signedFetch(`${baseUrl}/values/${key}`, { method: 'DELETE', identity })
      })

      it('should respond with a 404 and a not found message', async () => {
        const response = await signedFetch(`${baseUrl}/values/${key}`, { method: 'GET', identity })
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
        await signedFetch(`${baseUrl}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: storedValue }),
          identity
        })
      })

      afterEach(async () => {
        await signedFetch(`${baseUrl}/values/${key}`, { method: 'DELETE', identity })
      })

      it('should respond with a 200 and the stored value', async () => {
        const response = await signedFetch(`${baseUrl}/values/${key}`, { method: 'GET', identity })
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
        const response = await signedFetch(`${baseUrl}/values/${key}`, { method: 'GET', identity })
        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body).toEqual({
          message: 'boom'
        })
      })
    })
  })
})
