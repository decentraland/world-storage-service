import { authorizationMiddleware } from '../../../../src/controllers/middlewares/authorization-middleware'
import { buildTestContext } from '../../utils/context'
import type { BaseComponents } from '../../../../src/types'
import type { TestContext } from '../../utils/context'

describe('authorizationMiddleware', () => {
  const UNAUTHORIZED_ADDRESS = '0x123'
  const AUTHORITATIVE_ADDRESS = '0xabc'
  const AUTHORITATIVE_ADDRESS_MIXED_CASE = '0xAbC'
  const AUTHORIZED_ADDRESS_1 = '0x456'
  const AUTHORIZED_ADDRESS_2 = '0x789'

  const next = jest.fn()
  let configGetString: jest.Mock
  let warn: jest.Mock

  beforeEach(() => {
    configGetString = jest.fn()
    warn = jest.fn()
    next.mockReset()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function buildCtx(auth?: string): TestContext {
    return buildTestContext({
      verification: { auth: auth ?? '', authMetadata: {} },
      components: {
        config: { getString: configGetString },
        logs: { getLogger: () => ({ warn }) }
      } as unknown as BaseComponents
    })
  }

  describe('when both authoritative server address and authorized addresses are not configured', () => {
    beforeEach(() => {
      configGetString.mockResolvedValue(undefined)
      next.mockResolvedValue({ status: 200 })
    })

    it('should allow the request', async () => {
      const result = await authorizationMiddleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when both authoritative server address and authorized addresses are empty or whitespace', () => {
    beforeEach(() => {
      configGetString.mockImplementation((key: string) => {
        if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
          return Promise.resolve('   ')
        }
        if (key === 'AUTHORIZED_ADDRESSES') {
          return Promise.resolve(', , ,')
        }
        return Promise.resolve(undefined)
      })
      next.mockResolvedValue({ status: 200 })
    })

    it('should allow the request', async () => {
      const result = await authorizationMiddleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200 })
    })
  })

  describe('when only authoritative server address is configured', () => {
    describe('and the signer matches the authoritative server address', () => {
      beforeEach(() => {
        configGetString.mockImplementation((key: string) => {
          if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
            return Promise.resolve(AUTHORITATIVE_ADDRESS_MIXED_CASE)
          }
          return Promise.resolve(undefined)
        })
        next.mockResolvedValue({ status: 200 })
      })

      it('should allow the request (case-insensitive)', async () => {
        const result = await authorizationMiddleware(buildCtx(AUTHORITATIVE_ADDRESS), next)

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200 })
      })
    })

    describe('and the signer does not match the authoritative server address', () => {
      beforeEach(() => {
        configGetString.mockImplementation((key: string) => {
          if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
            return Promise.resolve(AUTHORITATIVE_ADDRESS)
          }
          return Promise.resolve(undefined)
        })
      })

      it('should respond with 401 and the appropriate error message', async () => {
        const result = await authorizationMiddleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

        expect(next).not.toHaveBeenCalled()
        expect(result).toEqual({
          status: 401,
          body: { message: 'Unauthorized: Signer is not authorized to perform operations' }
        })
        expect(warn).toHaveBeenCalled()
      })
    })
  })

  describe('when only authorized addresses are configured', () => {
    beforeEach(() => {
      configGetString.mockImplementation((key: string) => {
        if (key === 'AUTHORIZED_ADDRESSES') {
          return Promise.resolve(`${AUTHORIZED_ADDRESS_1},${AUTHORIZED_ADDRESS_2}`)
        }
        return Promise.resolve(undefined)
      })
      next.mockResolvedValue({ status: 200 })
    })

    describe('and the signer is in the authorized addresses list', () => {
      it('should allow the request', async () => {
        const result = await authorizationMiddleware(buildCtx(AUTHORIZED_ADDRESS_1), next)

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200 })
      })
    })

    describe('and the signer is not in the authorized addresses list', () => {
      it('should respond with 401 and the appropriate error message', async () => {
        const result = await authorizationMiddleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

        expect(next).not.toHaveBeenCalled()
        expect(result).toEqual({
          status: 401,
          body: { message: 'Unauthorized: Signer is not authorized to perform operations' }
        })
        expect(warn).toHaveBeenCalled()
      })
    })
  })

  describe('when both authoritative server address and authorized addresses are configured', () => {
    beforeEach(() => {
      configGetString.mockImplementation((key: string) => {
        if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
          return Promise.resolve(AUTHORITATIVE_ADDRESS_MIXED_CASE)
        }
        if (key === 'AUTHORIZED_ADDRESSES') {
          return Promise.resolve(`${AUTHORIZED_ADDRESS_1}, ${AUTHORIZED_ADDRESS_2}`)
        }
        return Promise.resolve(undefined)
      })
      next.mockResolvedValue({ status: 200 })
    })

    describe('and the signer matches the authoritative server address', () => {
      it('should allow the request', async () => {
        const result = await authorizationMiddleware(buildCtx(AUTHORITATIVE_ADDRESS), next)

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200 })
      })
    })

    describe('and the signer is in the authorized addresses list', () => {
      it('should allow the request', async () => {
        const result = await authorizationMiddleware(buildCtx(AUTHORIZED_ADDRESS_1), next)

        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200 })
      })
    })

    describe('and the signer is not in any of the allowed addresses', () => {
      it('should respond with 401 and the appropriate error message', async () => {
        const result = await authorizationMiddleware(buildCtx(UNAUTHORIZED_ADDRESS), next)

        expect(next).not.toHaveBeenCalled()
        expect(result).toEqual({
          status: 401,
          body: { message: 'Unauthorized: Signer is not authorized to perform operations' }
        })
        expect(warn).toHaveBeenCalled()
      })
    })
  })

  describe('when the signer address is missing', () => {
    beforeEach(() => {
      configGetString.mockImplementation((key: string) => {
        if (key === 'AUTHORITATIVE_SERVER_ADDRESS') {
          return Promise.resolve(AUTHORITATIVE_ADDRESS)
        }
        return Promise.resolve(undefined)
      })
    })

    it('should respond with 401 and the appropriate error message', async () => {
      const result = await authorizationMiddleware(buildCtx(undefined), next)

      expect(next).not.toHaveBeenCalled()
      expect(result).toEqual({
        status: 401,
        body: { message: 'Unauthorized: No signer address found' }
      })
    })
  })
})
