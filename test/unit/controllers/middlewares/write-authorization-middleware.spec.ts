import { writeAuthorizationMiddleware } from '../../../../src/controllers/middlewares/write-authorization-middleware'
import { buildTestContext } from '../../utils/context'
import type { BaseComponents } from '../../../../src/types'
import type { TestContext } from '../../utils/context'

describe('writeAuthorizationMiddleware', () => {
  const SIGNER_ADDRESS = '0xabc'
  const SIGNER_ADDRESS_MIXED_CASE = '0xAbC'
  const AUTHORIZED_ADDRESS_1 = '0x123'
  const AUTHORIZED_ADDRESS_2 = '0x111'
  const AUTHORIZED_ADDRESS_3 = '0x222'

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
    next.mockResolvedValue({ status: 200 })

    const result = await writeAuthorizationMiddleware(buildCtx(SIGNER_ADDRESS), next)

    expect(next).toHaveBeenCalled()
    expect(result).toEqual({ status: 200 })
  })

  it('allows when authorized list is empty after parsing', async () => {
    configGetString.mockResolvedValue(', , ,')
    next.mockResolvedValue({ status: 200 })

    const result = await writeAuthorizationMiddleware(buildCtx(SIGNER_ADDRESS), next)

    expect(next).toHaveBeenCalled()
    expect(result).toEqual({ status: 200 })
  })

  it('allows when signer is in the list (case-insensitive)', async () => {
    configGetString.mockResolvedValue(`${AUTHORIZED_ADDRESS_1},${SIGNER_ADDRESS_MIXED_CASE}`)
    next.mockResolvedValue({ status: 200 })

    const result = await writeAuthorizationMiddleware(buildCtx(SIGNER_ADDRESS), next)

    expect(next).toHaveBeenCalled()
    expect(result).toEqual({ status: 200 })
  })

  it('returns 401 when signer is missing', async () => {
    configGetString.mockResolvedValue(AUTHORIZED_ADDRESS_1)

    const result = await writeAuthorizationMiddleware(buildCtx(undefined), next)

    expect(next).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 401,
      body: { message: 'Unauthorized: No signer address found' }
    })
  })

  it('returns 401 when signer not authorized', async () => {
    configGetString.mockResolvedValue(`${AUTHORIZED_ADDRESS_2},${AUTHORIZED_ADDRESS_3}`)

    const result = await writeAuthorizationMiddleware(buildCtx(SIGNER_ADDRESS), next)

    expect(next).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 401,
      body: { message: 'Unauthorized: Signer is not authorized to perform write operations' }
    })
    expect(warn).toHaveBeenCalled()
  })
})
