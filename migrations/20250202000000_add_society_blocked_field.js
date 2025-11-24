exports.up = function(knex) {
  return knex.schema.raw(`
    -- Add is_blocked column to societies table
    ALTER TABLE societies
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
    
    -- Create index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_societies_is_blocked ON societies(is_blocked);
  `);
};

exports.down = function(knex) {
  return knex.schema.raw(`
    DROP INDEX IF EXISTS idx_societies_is_blocked;
    ALTER TABLE societies
    DROP COLUMN IF EXISTS is_blocked;
  `);
};

