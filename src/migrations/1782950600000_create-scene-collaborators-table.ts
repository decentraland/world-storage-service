import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('scene_collaborators', {
    address: { type: 'varchar(255)', notNull: true },
    scene_id: { type: 'varchar(255)', notNull: true },
    world_name: { type: 'varchar(255)', notNull: true },
    base_parcel: { type: 'varchar(64)', notNull: true },
    title: { type: 'varchar(255)', notNull: false },
    realm_kind: { type: 'varchar(16)', notNull: true },
    deployed_at: { type: 'bigint', notNull: true, default: 0 },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  })
  pgm.addConstraint('scene_collaborators', 'scene_collaborators_pkey', {
    primaryKey: ['scene_id', 'address']
  })
  pgm.createIndex('scene_collaborators', 'address', { name: 'scene_collaborators_address_idx' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('scene_collaborators')
}
