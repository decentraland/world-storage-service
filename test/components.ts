import { createLocalFetchComponent, createRunner } from '@dcl/test-helpers'
import { initComponents as originalInitComponents } from '../src/components'
import { main } from '../src/service'
import type { TestComponents } from '../src/types'

export const test = createRunner<TestComponents>({
  main,
  initComponents
})

async function initComponents(): Promise<TestComponents> {
  const components = await originalInitComponents()

  const { config } = components

  return {
    ...components,
    localFetch: await createLocalFetchComponent(config)
  }
}
