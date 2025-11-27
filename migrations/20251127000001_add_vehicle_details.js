// migrations/20251127000001_add_vehicle_details.js
module.exports.up = async function (knex) {
    await knex.raw(`
    -- Add comprehensive vehicle tracking fields
    ALTER TABLE vehicle 
    
    -- Basic Vehicle Information
    ADD COLUMN IF NOT EXISTS vehicle_make VARCHAR(100),
    ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS vehicle_year INTEGER,
    ADD COLUMN IF NOT EXISTS color VARCHAR(50),
    ADD COLUMN IF NOT EXISTS vin_number VARCHAR(50) UNIQUE,
    ADD COLUMN IF NOT EXISTS engine_number VARCHAR(50),
    
    -- Vehicle Type & Capacity
    ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(50) DEFAULT 'truck',
    ADD COLUMN IF NOT EXISTS capacity DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS capacity_unit VARCHAR(20) DEFAULT 'cubic_meters',
    ADD COLUMN IF NOT EXISTS fuel_type VARCHAR(50) DEFAULT 'diesel',
    
    -- Purchase Information
    ADD COLUMN IF NOT EXISTS purchased_date DATE,
    ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(12,2),
    
    -- Registration & Legal Documents
    ADD COLUMN IF NOT EXISTS registration_date DATE,
    ADD COLUMN IF NOT EXISTS registration_expiry_date DATE,
    ADD COLUMN IF NOT EXISTS insurance_expiry_date DATE,
    ADD COLUMN IF NOT EXISTS fitness_certificate_expiry DATE,
    
    -- Operational Data
    ADD COLUMN IF NOT EXISTS odometer_reading INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_maintenance_date DATE,
    ADD COLUMN IF NOT EXISTS next_maintenance_due DATE,
    ADD COLUMN IF NOT EXISTS last_service_odometer INTEGER,
    
    -- Additional Information
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS insurance_provider VARCHAR(255),
    ADD COLUMN IF NOT EXISTS insurance_policy_number VARCHAR(100);

    -- Add indexes for frequently queried fields
    CREATE INDEX IF NOT EXISTS idx_vehicle_vin ON vehicle(vin_number);
    CREATE INDEX IF NOT EXISTS idx_vehicle_type ON vehicle(vehicle_type);
    CREATE INDEX IF NOT EXISTS idx_vehicle_registration_expiry ON vehicle(registration_expiry_date);
    CREATE INDEX IF NOT EXISTS idx_vehicle_insurance_expiry ON vehicle(insurance_expiry_date);
    CREATE INDEX IF NOT EXISTS idx_vehicle_next_maintenance ON vehicle(next_maintenance_due);
    
    -- Add comments for documentation
    COMMENT ON COLUMN vehicle.capacity IS 'Vehicle waste capacity in specified unit';
    COMMENT ON COLUMN vehicle.capacity_unit IS 'Unit of capacity measurement (cubic_meters, tons, gallons)';
    COMMENT ON COLUMN vehicle.vehicle_type IS 'Type of vehicle (truck, compactor, tipper, mini_truck)';
    COMMENT ON COLUMN vehicle.fuel_type IS 'Fuel type (diesel, petrol, electric, cng, hybrid)';
    COMMENT ON COLUMN vehicle.odometer_reading IS 'Current odometer reading in kilometers';
  `);
};

module.exports.down = async function (knex) {
    await knex.raw(`
    -- Drop indexes first
    DROP INDEX IF EXISTS idx_vehicle_vin;
    DROP INDEX IF EXISTS idx_vehicle_type;
    DROP INDEX IF EXISTS idx_vehicle_registration_expiry;
    DROP INDEX IF EXISTS idx_vehicle_insurance_expiry;
    DROP INDEX IF EXISTS idx_vehicle_next_maintenance;
    
    -- Remove added columns
    ALTER TABLE vehicle 
    DROP COLUMN IF EXISTS vehicle_make,
    DROP COLUMN IF EXISTS vehicle_model,
    DROP COLUMN IF EXISTS vehicle_year,
    DROP COLUMN IF EXISTS color,
    DROP COLUMN IF EXISTS vin_number,
    DROP COLUMN IF EXISTS engine_number,
    DROP COLUMN IF EXISTS vehicle_type,
    DROP COLUMN IF EXISTS capacity,
    DROP COLUMN IF EXISTS capacity_unit,
    DROP COLUMN IF EXISTS fuel_type,
    DROP COLUMN IF EXISTS purchased_date,
    DROP COLUMN IF EXISTS purchase_price,
    DROP COLUMN IF EXISTS registration_date,
    DROP COLUMN IF EXISTS registration_expiry_date,
    DROP COLUMN IF EXISTS insurance_expiry_date,
    DROP COLUMN IF EXISTS fitness_certificate_expiry,
    DROP COLUMN IF EXISTS odometer_reading,
    DROP COLUMN IF EXISTS last_maintenance_date,
    DROP COLUMN IF EXISTS next_maintenance_due,
    DROP COLUMN IF EXISTS last_service_odometer,
    DROP COLUMN IF EXISTS notes,
    DROP COLUMN IF EXISTS insurance_provider,
    DROP COLUMN IF EXISTS insurance_policy_number;
  `);
};
