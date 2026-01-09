import type { AuthIdentity } from '@dcl/crypto'
import type { signedFetchFactory } from 'decentraland-crypto-fetch'
import { createTestSetup } from './utils/setup'
import { test } from '../components'

test('Get Player Storage Controller', function ({ components, stubComponents }) {
  let signedFetch: ReturnType<typeof signedFetchFactory>
  let baseUrl: string

  describe('when getting a player storage value', () => {
    let key: string
    let playerAddress: string
    let identity: AuthIdentity

    beforeEach(async () => {
      key = 'my-key'
      playerAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const setup = await createTestSetup(components)
      signedFetch = setup.signedFetch
      baseUrl = setup.baseUrl
      identity = setup.identity
    })

    describe('and the request does not include an identity', () => {
      let response: Awaited<ReturnType<typeof signedFetch>>

      beforeEach(async () => {
        response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, { method: 'GET' })
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

    describe('and the value does not exist', () => {
      beforeEach(async () => {
        await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, { method: 'DELETE', identity })
      })

      it('should respond with a 404 and a not found message', async () => {
        const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'GET',
          identity
        })
        const body = await response.json()
        expect(response.status).toBe(404)
        expect(body).toEqual({
          message: 'Value not found'
        })
      })
    })

    describe('and the value exists', () => {
      let storedValue: string

      beforeEach(async () => {
        storedValue = 'stored-value'
        await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: storedValue }),
          identity
        })
      })

      afterEach(async () => {
        await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, { method: 'DELETE', identity })
      })

      it('should respond with a 200 and the stored value', async () => {
        const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'GET',
          identity
        })
        const body = await response.json()
        expect(response.status).toBe(200)
        expect(body).toEqual({
          value: storedValue
        })
      })
    })

    describe('and the database throws an error', () => {
      beforeEach(() => {
        stubComponents.playerStorage.getValue.rejects(new Error('boom'))
      })

      afterEach(() => {
        stubComponents.playerStorage.getValue.reset()
      })

      it('should respond with a 500 and the error message', async () => {
        const response = await signedFetch(`${baseUrl}/players/${playerAddress}/values/${key}`, {
          method: 'GET',
          identity
        })
        const body = await response.json()
        expect(response.status).toBe(500)
        expect(body).toEqual({
          message: 'boom'
        })
      })
    })
  })
})
