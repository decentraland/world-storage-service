/* eslint-disable camelcase */

exports.shorthands = undefined

exports.up = (pgm) => {
  pgm.createTable('env_variables', {
    world_name: {
      type: 'varchar(255)',
      notNull: true
    },
    key: {
      type: 'varchar(255)',
      notNull: true
    },
    value_enc: {
      type: 'bytea',
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
  pgm.addConstraint('env_variables', 'env_variables_pkey', {
    primaryKey: ['world_name', 'key']
  })
}

exports.down = (pgm) => {
  pgm.dropTable('env_variables')
}
