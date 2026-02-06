import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Adds functional btree indexes for case-insensitive prefix searches
 *
 * These indexes optimize queries that use `lower(key) LIKE 'prefix%'` pattern
 * for the list/count operations on each storage table.
 *
 * The indexes use varchar_pattern_ops to enable LIKE prefix matching.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Index for env_variables: WHERE world_name = ? AND lower(key) LIKE 'prefix%'
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS env_variables_world_key_lower_prefix_idx
      ON env_variables (world_name, lower(key) varchar_pattern_ops)
  `)

  // Index for world_storage: WHERE world_name = ? AND lower(key) LIKE 'prefix%'
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS world_storage_world_key_lower_prefix_idx
      ON world_storage (world_name, lower(key) varchar_pattern_ops)
  `)

  // Index for player_storage: WHERE world_name = ? AND player_address = ? AND lower(key) LIKE 'prefix%'
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS player_storage_world_player_key_lower_prefix_idx
      ON player_storage (world_name, player_address, lower(key) varchar_pattern_ops)
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS env_variables_world_key_lower_prefix_idx')
  pgm.sql('DROP INDEX IF EXISTS world_storage_world_key_lower_prefix_idx')
  pgm.sql('DROP INDEX IF EXISTS player_storage_world_player_key_lower_prefix_idx')
}
