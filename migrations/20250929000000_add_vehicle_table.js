// migrations/20250929000000_add_vehicle_table.js
module.exports.up = async function (knex) {
  await knex.raw(`
    -- Create function for updating timestamps (if not exists)
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Vehicle Table
    CREATE TABLE IF NOT EXISTS vehicle (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        driver_name TEXT,
        plate_no VARCHAR(20) NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Trigger for auto-updating timestamps
    CREATE TRIGGER update_vehicle_updated_at BEFORE UPDATE ON vehicle 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_vehicle_user_id ON vehicle(user_id);
    CREATE INDEX IF NOT EXISTS idx_vehicle_plate_no ON vehicle(plate_no);
    CREATE INDEX IF NOT EXISTS idx_vehicle_status ON vehicle(status);
    CREATE INDEX IF NOT EXISTS idx_vehicle_created_at ON vehicle(created_at);
  `);
};

module.exports.down = async function (knex) {
  await knex.raw(`
    -- Drop triggers first
    DROP TRIGGER IF EXISTS update_vehicle_updated_at ON vehicle;
    
    -- Drop table
    DROP TABLE IF EXISTS vehicle CASCADE;
  `);
};
