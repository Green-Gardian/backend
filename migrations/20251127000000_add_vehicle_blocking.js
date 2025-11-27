// migrations/20251127000000_add_vehicle_blocking.js
module.exports.up = async function (knex) {
    await knex.raw(`
    -- Add is_blocked and blocked_reason columns to vehicle table
    ALTER TABLE vehicle 
    ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
    ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS blocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

    -- Add index for better query performance
    CREATE INDEX IF NOT EXISTS idx_vehicle_is_blocked ON vehicle(is_blocked);
  `);
};

module.exports.down = async function (knex) {
    await knex.raw(`
    -- Remove blocking-related columns
    ALTER TABLE vehicle 
    DROP COLUMN IF EXISTS is_blocked,
    DROP COLUMN IF EXISTS blocked_reason,
    DROP COLUMN IF EXISTS blocked_at,
    DROP COLUMN IF EXISTS blocked_by;

    -- Drop index
    DROP INDEX IF EXISTS idx_vehicle_is_blocked;
  `);
};
