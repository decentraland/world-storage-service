import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/http-commons'
import { validateConfirmDeleteAllHeader } from '../../../../../src/controllers/handlers/commons/confirmDeleteAll'

describe('Confirm Delete All Header Validation', () => {
  let request: { headers: { get: jest.Mock } }
  describe('when the X-Confirm-Delete-All header is present', () => {
    beforeEach(() => {
      request = {
        headers: {
          get: jest.fn().mockReturnValue('true')
        }
      }
    })

    it('should not throw an error', () => {
      expect(() => validateConfirmDeleteAllHeader(request as unknown as IHttpServerComponent.IRequest)).not.toThrow()
    })
  })

  describe('when the X-Confirm-Delete-All header is missing', () => {
    beforeEach(() => {
      request = {
        headers: {
          get: jest.fn().mockReturnValue(null)
        }
      }
    })

    it('should throw an InvalidRequestError', () => {
      expect(() => validateConfirmDeleteAllHeader(request as unknown as IHttpServerComponent.IRequest)).toThrow(
        InvalidRequestError
      )
    })

    it('should throw with the correct message', () => {
      expect(() => validateConfirmDeleteAllHeader(request as unknown as IHttpServerComponent.IRequest)).toThrow(
        'Missing required header: X-Confirm-Delete-All'
      )
    })
  })
})
