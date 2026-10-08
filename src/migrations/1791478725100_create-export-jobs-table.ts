import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('export_jobs', {
    id: { type: 'uuid', primaryKey: true },
    world_name: { type: 'varchar(255)', notNull: true },
    place_id: { type: 'uuid', notNull: true },
    requested_by: { type: 'varchar(255)', notNull: true },
    format: { type: 'varchar(8)', notNull: true, check: "format IN ('json','csv')" },
    selection: { type: 'jsonb', notNull: true },
    status: { type: 'varchar(16)', notNull: true, check: "status IN ('pending','running','done','failed')" },
    content: { type: 'bytea' },
    size_bytes: { type: 'integer' },
    error: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    started_at: { type: 'timestamptz' },
    completed_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz' }
  })

  pgm.sql(
    'CREATE INDEX export_jobs_scene_requester_idx ON export_jobs (world_name, place_id, requested_by, created_at DESC)'
  )
  pgm.sql("CREATE INDEX export_jobs_pending_idx ON export_jobs (created_at) WHERE status = 'pending'")
  pgm.sql('ALTER TABLE export_jobs ALTER COLUMN content SET STORAGE EXTERNAL')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('export_jobs')
}
