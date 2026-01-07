import { test } from '../components'

test('Delete World Storage Controller', function ({ components, stubComponents }) {
  describe('when deleting a world storage value', () => {
    let key: string
    let localFetch: typeof components.localFetch
    let response: Awaited<ReturnType<typeof components.localFetch.fetch>>

    beforeEach(() => {
      key = 'my-key'
      localFetch = components.localFetch
    })

    describe('and the delete succeeds', () => {
      let storedValue: string

      beforeEach(async () => {
        storedValue = 'to-delete'
        await localFetch.fetch(`/storage/world/${key}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ value: storedValue })
        })

        response = await localFetch.fetch(`/storage/world/${key}`, { method: 'DELETE' })
      })

      it('should respond with a 204', () => {
        expect(response.status).toBe(204)
      })
    })

    describe('and the storage delete throws an error', () => {
      beforeEach(async () => {
        stubComponents.worldStorage.deleteValue.rejects(new Error('boom'))
        response = await localFetch.fetch(`/storage/world/${key}`, { method: 'DELETE' })
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
