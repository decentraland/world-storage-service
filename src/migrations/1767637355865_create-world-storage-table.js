/* eslint-disable camelcase */

exports.shorthands = undefined

exports.up = (pgm) => {
  pgm.createTable('world_storage', {
    world_name: {
      type: 'varchar(255)',
      notNull: true
    },
    key: {
      type: 'varchar(255)',
      notNull: true
    },
    value: {
      type: 'jsonb',
      notNull: true
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp')
    }
  })

  // Create composite primary key
  // The primary key index (world_name, key) can efficiently handle queries on world_name alone
  pgm.addConstraint('world_storage', 'world_storage_pkey', {
    primaryKey: ['world_name', 'key']
  })
}

exports.down = (pgm) => {
  pgm.dropTable('world_storage')
}
