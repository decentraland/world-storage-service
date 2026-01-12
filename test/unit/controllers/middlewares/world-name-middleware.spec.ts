import { worldNameMiddleware } from '../../../../src/controllers/middlewares/world-name-middleware'

describe('worldNameMiddleware', () => {
  const next = jest.fn()

  beforeEach(() => {
    next.mockReset()
  })

  function buildCtx(metadata?: any) {
    return {
      verification: { authMetadata: metadata },
      worldName: undefined
    } as any
  }

  it('returns 400 when world name is missing', async () => {
    const ctx = buildCtx({})

    const result = await worldNameMiddleware(ctx, next)

    expect(next).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 400,
      body: { message: 'World name is required' }
    })
  })

  it('returns 400 when world name is empty', async () => {
    const ctx = buildCtx({ realm: { serverName: '' } })

    const result = await worldNameMiddleware(ctx, next)

    expect(next).not.toHaveBeenCalled()
    expect(result).toEqual({
      status: 400,
      body: { message: 'World name is required' }
    })
  })

  it('sets worldName from realm.serverName and calls next', async () => {
    const ctx = buildCtx({ realm: { serverName: 'example.dcl.eth' } })
    next.mockResolvedValue({ status: 204 })

    const result = await worldNameMiddleware(ctx, next)

    expect(ctx.worldName).toBe('example.dcl.eth')
    expect(next).toHaveBeenCalled()
    expect(result).toEqual({ status: 204 })
  })

  it('sets worldName from realmName fallback and calls next', async () => {
    const ctx = buildCtx({ realmName: 'fallback.dcl.eth' })
    next.mockResolvedValue({ status: 200 })

    const result = await worldNameMiddleware(ctx, next)

    expect(ctx.worldName).toBe('fallback.dcl.eth')
    expect(next).toHaveBeenCalled()
    expect(result).toEqual({ status: 200 })
  })
})
