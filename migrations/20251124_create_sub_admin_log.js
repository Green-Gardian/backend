// migrations/YYYYMMDDHHMMSS_create_sub_admin_activity_logs.js
module.exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sub_admin_activity_logs (
      id SERIAL PRIMARY KEY,
      sub_admin_id INTEGER NOT NULL,
      activity_type VARCHAR(100) NOT NULL,
      activity_description TEXT NOT NULL,
      ip_address VARCHAR(45),
      user_agent TEXT,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sub_admin
        FOREIGN KEY (sub_admin_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    );

    -- Create index on sub_admin_id for faster queries
    CREATE INDEX IF NOT EXISTS idx_sub_admin_logs_sub_admin_id 
      ON sub_admin_activity_logs(sub_admin_id);
    
    -- Create index on created_at for faster date-based queries
    CREATE INDEX IF NOT EXISTS idx_sub_admin_logs_created_at 
      ON sub_admin_activity_logs(created_at DESC);

    -- Create index on activity_type for filtering by action type
    CREATE INDEX IF NOT EXISTS idx_sub_admin_logs_activity_type 
      ON sub_admin_activity_logs(activity_type);
  `);
};

module.exports.down = async function (knex) {
  await knex.raw(`DROP TABLE IF EXISTS sub_admin_activity_logs CASCADE`);
};