// migrations/YYYYMMDDHHMMSS_add_created_by_to_users.js

exports.up = function(knex) {
  return knex.schema.raw(`
    -- Add created_by column to users table
    ALTER TABLE users
    ADD COLUMN created_by INTEGER;
    
    -- Add foreign key constraint to reference the admin who created this user
    ALTER TABLE users
    ADD CONSTRAINT fk_users_created_by
    FOREIGN KEY (created_by)
    REFERENCES users(id)
    ON DELETE SET NULL;
    
    -- Add index for better query performance
    CREATE INDEX idx_users_created_by ON users(created_by);
  `);
};

exports.down = function(knex) {
  return knex.schema.raw(`
    -- Drop the index
    DROP INDEX IF EXISTS idx_users_created_by;
    
    -- Drop the foreign key constraint
    ALTER TABLE users
    DROP CONSTRAINT IF EXISTS fk_users_created_by;
    
    -- Drop the created_by column
    ALTER TABLE users
    DROP COLUMN IF EXISTS created_by;
  `);
};