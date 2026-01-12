import { writeAuthorizationMiddleware } from '../../../../src/controllers/middlewares/write-authorization-middleware'
import { buildTestContext } from '../../utils/context'
import type { BaseComponents } from '../../../../src/types'
import type { TestContext } from '../../utils/context'

describe('writeAuthorizationMiddleware', () => {
  const next = jest.fn()
  let configGetString: jest.Mock
  let warn: jest.Mock

  beforeEach(() => {
    configGetString = jest.fn()
    warn = jest.fn()
    next.mockReset()
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

  it('allows when no authorized addresses configured', async () => {
    configGetString.mockResolvedValue(undefined)
    next.mockResolvedValue({ status: 204 })

    const result = await writeAuthorizationMiddleware(buildCtx('0xabc'), next)

    expect(next).toHaveBeenCalled()
    expect(result).toEqual({ status: 204 })
  })

  it('allows when authorized list is empty after parsing', async () => {
    configGetString.mockResolvedValue(', , ,')
    next.mockResolvedValue({ status: 200 })

    const result = await writeAuthorizationMiddleware(buildCtx('0xabc'), next)

    expect(next).toHaveBeenCalled()
    expect(result).toEqual({ status: 200 })
  })

  it('allows when signer is in the list (case-insensitive)', async () => {
    configGetString.mockResolvedValue('0x123,0xAbC')
    next.mockResolvedValue({ status: 200 })

    const result = await writeAuthorizationMiddleware(buildCtx('0xabc'), next)

    expect(next).toHaveBeenCalled()
    expect(result).toEqual({ status: 200 })
  })

  it('returns 401 when signer is missing', async () => {
    configGetString.mockResolvedValue('0x123')

    const result = await writeAuthorizationMiddleware(buildCtx(undefined), next)

    expect(next).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 401,
      body: { message: 'Unauthorized: No signer address found' }
    })
  })

  it('returns 401 when signer not authorized', async () => {
    configGetString.mockResolvedValue('0x111,0x222')

    const result = await writeAuthorizationMiddleware(buildCtx('0xabc'), next)

    expect(next).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 401,
      body: { message: 'Unauthorized: Signer is not authorized to perform write operations' }
    })
    expect(warn).toHaveBeenCalled()
  })
})
