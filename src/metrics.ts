import { IMetricsComponent } from '@well-known-components/interfaces'
import { metricDeclarations as logsMetricsDeclarations } from '@well-known-components/logger'
import { getDefaultHttpMetrics } from '@dcl/http-server'
import { validateMetricsDeclaration } from '@dcl/metrics'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...logsMetricsDeclarations,
  world_storage_world_events_dropped_total: {
    help: 'World events dropped because their source server is not accepted',
    type: IMetricsComponent.CounterType,
    labelNames: ['sub_type', 'reason']
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
