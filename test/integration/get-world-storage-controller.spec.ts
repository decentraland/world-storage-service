import { test } from '../components'

test('Get World Storage Controller', function ({ components, stubComponents }) {
  describe('when getting a world storage value', () => {
    let key: string
    let localFetch: typeof components.localFetch

    beforeEach(() => {
      key = 'my-key'
      localFetch = components.localFetch
    })

    describe('and the value does not exist', () => {
      beforeEach(async () => {
        await localFetch.fetch(`/storage/world/${key}`, { method: 'DELETE' })
      })

      it('should respond with a 404 and a not found message', async () => {
        const response = await localFetch.fetch(`/storage/world/${key}`)
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
        await localFetch.fetch(`/storage/world/${key}`, {
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
        const response = await localFetch.fetch(`/storage/world/${key}`)
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
        const response = await localFetch.fetch(`/storage/world/${key}`)
        expect(response.status).toBe(500)
        const body = await response.json()
        expect(body).toEqual({
          message: 'boom'
        })
      })
    })
  })
})
