import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Records which worlds server each world scene came from. NULL is the default
 * WORLDS_CONTENT_SERVER_URL (and Genesis), so every existing row keeps its meaning.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('scene_collaborators', {
    source_content_server_url: { type: 'varchar(255)', notNull: false }
  })

  pgm.createTable('world_sources', {
    world_name: { type: 'varchar(255)', notNull: true, primaryKey: true },
    source_content_server_url: { type: 'varchar(255)', notNull: false },
    deployed_at: { type: 'bigint', notNull: true, default: 0 },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('world_sources')
  pgm.dropColumn('scene_collaborators', 'source_content_server_url')
}
