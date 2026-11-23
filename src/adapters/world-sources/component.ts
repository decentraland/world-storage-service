import { SQL } from 'sql-template-strings'
import type { IWorldSourcesComponent } from './types'
import type { AppComponents } from '../../types'

const NO_SOURCE = ''

/**
 * Creates the world sources component: which worlds server each world was last deployed
 * from, so request-path lookups (permissions, scenes) call that server. A NULL source is the
 * default WORLDS_CONTENT_SERVER_URL. Lookups are cached for `WORLD_PERMISSIONS_CACHE_TTL_SECONDS`
 * because every authenticated world request resolves its source.
 *
 * @param components - Required components: pg, cache, config, logs
 * @returns IWorldSourcesComponent implementation
 */
export async function createWorldSourcesComponent(
  components: Pick<AppComponents, 'pg' | 'cache' | 'config' | 'logs'>
): Promise<IWorldSourcesComponent> {
  const { pg, cache, config, logs } = components
  const logger = logs.getLogger('world-sources')
  const cacheTtlSeconds = (await config.getNumber('WORLD_PERMISSIONS_CACHE_TTL_SECONDS')) ?? 30

  function cacheKey(worldName: string): string {
    return `world-source:${worldName}`
  }

  async function recordDeployment(
    worldName: string,
    sourceContentServerUrl: string | null,
    deployedAt: number
  ): Promise<void> {
    const normalizedWorldName = worldName.toLowerCase()

    await pg.query(SQL`
      INSERT INTO world_sources (world_name, source_content_server_url, deployed_at, updated_at)
      VALUES (${normalizedWorldName}, ${sourceContentServerUrl}, ${deployedAt}, current_timestamp)
      ON CONFLICT (world_name) DO UPDATE
      SET source_content_server_url = EXCLUDED.source_content_server_url,
          deployed_at = EXCLUDED.deployed_at,
          updated_at = current_timestamp
      WHERE world_sources.deployed_at <= EXCLUDED.deployed_at`)
    await cache.remove(cacheKey(normalizedWorldName))

    logger.debug('World source recorded', {
      worldName: normalizedWorldName,
      sourceContentServerUrl: sourceContentServerUrl ?? 'default'
    })
  }

  async function getSource(worldName: string): Promise<string | null> {
    const normalizedWorldName = worldName.toLowerCase()
    const cached = await cache.get<string>(cacheKey(normalizedWorldName))
    if (cached !== undefined && cached !== null) {
      return cached === NO_SOURCE ? null : cached
    }

    const result = await pg.query<{ source_content_server_url: string | null }>(SQL`
      SELECT source_content_server_url FROM world_sources WHERE world_name = ${normalizedWorldName}`)
    const source = result.rows[0]?.source_content_server_url ?? null

    await cache.set(cacheKey(normalizedWorldName), source ?? NO_SOURCE, cacheTtlSeconds)

    return source
  }

  async function removeIfSource(worldName: string, sourceContentServerUrl: string | null): Promise<void> {
    const normalizedWorldName = worldName.toLowerCase()

    await pg.query(SQL`
      DELETE FROM world_sources
      WHERE world_name = ${normalizedWorldName}
        AND source_content_server_url IS NOT DISTINCT FROM ${sourceContentServerUrl}`)
    await cache.remove(cacheKey(normalizedWorldName))
  }

  return { recordDeployment, getSource, removeIfSource }
}
