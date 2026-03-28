exports.up = function(knex) {
  return knex.schema.raw(`
    -- Add MFA columns to users table
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS totp_secret TEXT,
    ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mfa_verified BOOLEAN DEFAULT FALSE;
    
    -- Enable MFA by default for admin and super_admin roles
    UPDATE users
    SET mfa_enabled = TRUE
    WHERE role IN ('admin', 'super_admin') AND (mfa_enabled IS NULL OR mfa_enabled = FALSE);
    
    -- Create index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled);
  `);
};

exports.down = function(knex) {
  return knex.schema.raw(`
    DROP INDEX IF EXISTS idx_users_mfa_enabled;
    ALTER TABLE users
    DROP COLUMN IF EXISTS totp_secret,
    DROP COLUMN IF EXISTS mfa_enabled,
    DROP COLUMN IF EXISTS mfa_verified;
  `);
};

