import { test } from '../components'

test('Upsert World Storage Controller', function ({ components, stubComponents }) {
  describe('when upserting a world storage value', () => {
    let key: string
    let localFetch: typeof components.localFetch
    let response: Awaited<ReturnType<typeof components.localFetch.fetch>>

    beforeEach(() => {
      key = 'my-key'
      localFetch = components.localFetch
    })

    describe('and the request body is not valid JSON', () => {
      let invalidBody: string

      beforeEach(async () => {
        invalidBody = '{ "value": '
        response = await localFetch.fetch(`/storage/world/${key}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: invalidBody
        })
      })

      it('should respond with a 400 and an invalid json message', async () => {
        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body).toEqual({
          message: 'Request body must be valid JSON'
        })
      })
    })

    describe('and the request body does not include a value', () => {
      beforeEach(async () => {
        response = await localFetch.fetch(`/storage/world/${key}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({})
        })
      })

      it('should respond with a 400 and a missing value message', async () => {
        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body).toEqual({
          message: 'Value is required'
        })
      })
    })

    describe('and the value is provided', () => {
      let storedValue: unknown

      beforeEach(async () => {
        storedValue = { foo: 'bar' }
        response = await localFetch.fetch(`/storage/world/${key}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ value: storedValue })
        })
      })

      afterEach(async () => {
        await localFetch.fetch(`/storage/world/${key}`, { method: 'DELETE' })
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
        response = await localFetch.fetch(`/storage/world/${key}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ value: 'payload' })
        })
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
