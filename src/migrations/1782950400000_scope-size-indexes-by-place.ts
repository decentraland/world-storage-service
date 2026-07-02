import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Replaces the storage-size covering indexes with place-aware versions.
 *
 * The per-write quota aggregation now filters the existing-value credit by
 * `(place_id, key)` and, for shared Genesis City realms, scopes the total by
 * `place_id` as well:
 *
 *   world_storage:   WHERE world_name = ? [AND place_id = ?]
 *   player_storage:  WHERE world_name = ? AND player_address = ? [AND place_id = ?]
 *   env_variables:   WHERE world_name = ? [AND place_id = ?]
 *
 * Leading the index with the scope columns (place_id last, so the world-scoped
 * `*.dcl.eth` aggregation still matches on the prefix) and carrying `key` and
 * `value_size` as INCLUDE payload keeps both query shapes index-only.
 *
 * The new indexes are built before the old ones are dropped so the per-write
 * aggregation never runs unindexed. Each CREATE is preceded by a DROP IF EXISTS
 * instead of using `CREATE ... IF NOT EXISTS`: an interrupted CONCURRENTLY build
 * leaves an INVALID index behind, which `IF NOT EXISTS` would silently keep on
 * re-run, while drop-then-create always ends with a valid index.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // CONCURRENTLY cannot run inside a transaction, so the migration opts out of the implicit one.
  pgm.noTransaction()

  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS world_storage_size_by_place_idx')
  pgm.sql(
    'CREATE INDEX CONCURRENTLY world_storage_size_by_place_idx ON world_storage (world_name, place_id) INCLUDE (key, value_size)'
  )

  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS player_storage_size_by_place_idx')
  pgm.sql(
    'CREATE INDEX CONCURRENTLY player_storage_size_by_place_idx ON player_storage (world_name, player_address, place_id) INCLUDE (key, value_size)'
  )

  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS env_variables_size_by_place_idx')
  pgm.sql(
    'CREATE INDEX CONCURRENTLY env_variables_size_by_place_idx ON env_variables (world_name, place_id) INCLUDE (key, value_size)'
  )

  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS world_storage_size_idx')
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS player_storage_size_idx')
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS env_variables_size_idx')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()

  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS world_storage_size_idx')
  pgm.sql('CREATE INDEX CONCURRENTLY world_storage_size_idx ON world_storage (world_name) INCLUDE (key, value_size)')

  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS player_storage_size_idx')
  pgm.sql(
    'CREATE INDEX CONCURRENTLY player_storage_size_idx ON player_storage (world_name, player_address) INCLUDE (key, value_size)'
  )

  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS env_variables_size_idx')
  pgm.sql('CREATE INDEX CONCURRENTLY env_variables_size_idx ON env_variables (world_name) INCLUDE (key, value_size)')

  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS world_storage_size_by_place_idx')
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS player_storage_size_by_place_idx')
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS env_variables_size_by_place_idx')
}
