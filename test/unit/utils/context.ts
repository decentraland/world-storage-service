import type { IHttpServerComponent } from '@dcl/core-commons'
import type { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import type { SceneAuthMetadata } from '../../../src/controllers/middlewares/scene-context-middleware'
import type { WorldStorageContext } from '../../../src/types'

export type TestContext = IHttpServerComponent.DefaultContext<
  WorldStorageContext & DecentralandSignatureContext<SceneAuthMetadata>
> & {
  params: Record<string, string>
}

export function buildTestContext(overrides: Partial<TestContext>): TestContext {
  return {
    request: new Request('http://localhost/values/key'),
    url: new URL('http://localhost/values/key'),
    params: {},
    components: {},
    parcel: '0,0',
    placeId: '830d885b-52f3-4c91-9151-9c8ec40aab63',
    ...overrides
  } as unknown as TestContext
}
