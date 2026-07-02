import { SQL } from 'sql-template-strings'
import { isSharedRealmName } from '../../utils/worldName'
import type { IStorageOperationsComponent } from './types'
import type { AppComponents } from '../../types'

/**
 * Builds the advisory lock key for a quota scope.
 *
 * The lock granularity must match the scope the quota is computed over: per world for
 * `*.dcl.eth` worlds, per place for shared Genesis City realms (locking the whole `main`
 * realm would serialize every Genesis City write globally), and additionally per player
 * for player storage.
 *
 * @param namespace - The storage namespace (`world-storage`, `player-storage`, `env-storage`)
 * @param worldName - The world identifier
 * @param placeId - The place ID (UUID) of the scene
 * @param playerAddress - The player's wallet address, for player-scoped quotas
 * @returns A stable string identifying the quota scope
 */
function quotaLockKey(namespace: string, worldName: string, placeId: string, playerAddress?: string): string {
  const scope = isSharedRealmName(worldName) ? `${worldName}:${placeId}` : worldName
  return playerAddress ? `${namespace}:${scope}:${playerAddress}` : `${namespace}:${scope}`
}

/**
 * Creates the storage operations component that orchestrates quota-guarded writes.
 *
 * Each upsert runs as:
 * 1. Open a transaction and take `pg_advisory_xact_lock` on the quota scope, serializing
 *    concurrent upserts to the same scope (the lock is released automatically on commit
 *    or rollback).
 * 2. Validate the value against the configured limits (the size query joins the
 *    transaction via the pg component's async context).
 * 3. Write the value.
 *
 * Without the lock, two concurrent upserts near the quota both validate against the same
 * usage snapshot and both write, exceeding the limit.
 *
 * After the transaction commits, world/player values are written through to the read
 * cache so the writing instance serves its own writes immediately (replicas rely on the
 * cache TTL, as documented on the storage adapters).
 *
 * @param components - Required components: pg, storageLimits, worldStorage, playerStorage, envStorage
 * @returns IStorageOperationsComponent implementation
 */
export async function createStorageOperationsComponent(
  components: Pick<AppComponents, 'pg' | 'storageLimits' | 'worldStorage' | 'playerStorage' | 'envStorage'>
): Promise<IStorageOperationsComponent> {
  const { pg, storageLimits, worldStorage, playerStorage, envStorage } = components

  /**
   * Runs an operation inside a transaction that holds the advisory lock for a quota scope.
   *
   * hashtextextended maps the scope string to the 64-bit advisory lock space; the lock is
   * transaction-scoped, so it is always released when the transaction commits or rolls back.
   *
   * These quota locks share the database-global advisory-lock space. The seed is fixed at 0
   * and this is currently the only advisory-lock user; any future caller must draw keys from
   * a disjoint space (or use a different mechanism) so it cannot collide with a quota lock.
   */
  async function withQuotaLock<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
    return pg.withAsyncContextTransaction(async () => {
      await pg.query(SQL`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)
      return operation()
    })
  }

  return {
    async upsertWorldValue(worldName: string, placeId: string, key: string, value: unknown): Promise<string> {
      const serializedValue = await withQuotaLock(quotaLockKey('world-storage', worldName, placeId), async () => {
        const serialized = await storageLimits.validateWorldStorageUpsert(worldName, placeId, key, value)
        await worldStorage.setValue(worldName, placeId, key, serialized)
        return serialized
      })

      await worldStorage.cacheValue(worldName, placeId, key, serializedValue)

      return serializedValue
    },

    async upsertPlayerValue(
      worldName: string,
      placeId: string,
      playerAddress: string,
      key: string,
      value: unknown
    ): Promise<string> {
      const serializedValue = await withQuotaLock(
        quotaLockKey('player-storage', worldName, placeId, playerAddress),
        async () => {
          const serialized = await storageLimits.validatePlayerStorageUpsert(
            worldName,
            placeId,
            playerAddress,
            key,
            value
          )
          await playerStorage.setValue(worldName, placeId, playerAddress, key, serialized)
          return serialized
        }
      )

      await playerStorage.cacheValue(worldName, placeId, playerAddress, key, serializedValue)

      return serializedValue
    },

    async upsertEnvValue(worldName: string, placeId: string, key: string, value: string): Promise<void> {
      await withQuotaLock(quotaLockKey('env-storage', worldName, placeId), async () => {
        await storageLimits.validateEnvStorageUpsert(worldName, placeId, key, value)
        await envStorage.setValue(worldName, placeId, key, value)
      })
    }
  }
}
