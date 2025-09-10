// migrations/20250907120000_resident_service_hub.js
module.exports.up = async function (knex) {
  await knex.raw(`
    -- Create function for updating timestamps
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Service Types Table (Waste categories and service types)
    CREATE TABLE IF NOT EXISTS service_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        category VARCHAR(50) NOT NULL CHECK (category IN ('construction', 'bulk', 'hazardous', 'electronic', 'organic', 'general')),
        base_price DECIMAL(10,2) DEFAULT 0.00,
        price_unit VARCHAR(20) DEFAULT 'fixed', -- 'fixed', 'per_kg', 'per_bag', 'per_hour'
        is_active BOOLEAN DEFAULT TRUE,
        requires_special_handling BOOLEAN DEFAULT FALSE,
        estimated_duration_hours INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User Addresses Table (For delivery/pickup locations)
    CREATE TABLE IF NOT EXISTS user_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        address_type VARCHAR(20) DEFAULT 'home' CHECK (address_type IN ('home', 'office', 'other')),
        street_address TEXT NOT NULL,
        apartment_unit VARCHAR(50),
        area VARCHAR(100),
        city VARCHAR(100) NOT NULL,
        postal_code VARCHAR(20),
        landmark TEXT,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        is_default BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User Profiles Table (Extended user information)
    CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        date_of_birth DATE,
        gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
        emergency_contact_name VARCHAR(255),
        emergency_contact_phone VARCHAR(15),
        notification_preferences JSONB DEFAULT '{"email": true, "sms": true, "push": true}',
        preferred_collection_time VARCHAR(20) DEFAULT 'morning' CHECK (preferred_collection_time IN ('morning', 'afternoon', 'evening')),
        special_instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Service Requests Table (Main table for waste collection requests)
    CREATE TABLE IF NOT EXISTS service_requests (
        id SERIAL PRIMARY KEY,
        request_number VARCHAR(20) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        service_type_id INTEGER REFERENCES service_types(id),
        address_id INTEGER REFERENCES user_addresses(id),
        driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Request Details
        title VARCHAR(255) NOT NULL,
        description TEXT,
        estimated_weight DECIMAL(8,2),
        estimated_bags INTEGER,
        special_instructions TEXT,
        
        -- Scheduling
        preferred_date DATE NOT NULL,
        preferred_time_slot VARCHAR(20) CHECK (preferred_time_slot IN ('morning', 'afternoon', 'evening')),
        scheduled_date DATE,
        scheduled_time_start TIMESTAMP,
        scheduled_time_end TIMESTAMP,
        
        -- Status and Tracking
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
            'pending', 'approved', 'assigned', 'in_progress', 
            'completed', 'cancelled', 'rejected'
        )),
        priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        
        -- Completion Details
        actual_weight DECIMAL(8,2),
        actual_bags INTEGER,
        completion_notes TEXT,
        completed_at TIMESTAMP,
        
        -- Financial
        quoted_price DECIMAL(10,2),
        final_price DECIMAL(10,2),
        payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN (
            'pending', 'paid', 'failed', 'refunded'
        )),
        payment_method VARCHAR(20),
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Service Request Photos Table (Before/after photos)
    CREATE TABLE IF NOT EXISTS service_request_photos (
        id SERIAL PRIMARY KEY,
        service_request_id INTEGER REFERENCES service_requests(id) ON DELETE CASCADE,
        photo_url TEXT NOT NULL,
        photo_type VARCHAR(20) CHECK (photo_type IN ('before', 'during', 'after', 'waste_type')),
        caption TEXT,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Service Request Status History Table (Track status changes)
    CREATE TABLE IF NOT EXISTS service_request_status_history (
        id SERIAL PRIMARY KEY,
        service_request_id INTEGER REFERENCES service_requests(id) ON DELETE CASCADE,
        old_status VARCHAR(20),
        new_status VARCHAR(20) NOT NULL,
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT,
        notes TEXT,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Service Feedback Table (Customer feedback and ratings)
    CREATE TABLE IF NOT EXISTS service_feedback (
        id SERIAL PRIMARY KEY,
        service_request_id INTEGER REFERENCES service_requests(id) ON DELETE CASCADE UNIQUE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        
        -- Ratings (1-5 scale)
        overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
        timeliness_rating INTEGER CHECK (timeliness_rating >= 1 AND timeliness_rating <= 5),
        professionalism_rating INTEGER CHECK (professionalism_rating >= 1 AND professionalism_rating <= 5),
        cleanliness_rating INTEGER CHECK (cleanliness_rating >= 1 AND cleanliness_rating <= 5),
        
        -- Feedback
        comments TEXT,
        would_recommend BOOLEAN,
        suggestions TEXT,
        
        -- Response from management
        admin_response TEXT,
        admin_responded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        admin_responded_at TIMESTAMP,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Service Request Messages Table (Communication between customer, driver, admin)
    CREATE TABLE IF NOT EXISTS service_request_messages (
        id SERIAL PRIMARY KEY,
        service_request_id INTEGER REFERENCES service_requests(id) ON DELETE CASCADE,
        sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
        attachment_url TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Function to generate request number
    CREATE OR REPLACE FUNCTION generate_request_number()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.request_number := 'REQ-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEW.id::TEXT, 4, '0');
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Triggers for auto-updating timestamps
    CREATE TRIGGER update_service_types_updated_at BEFORE UPDATE ON service_types 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_user_addresses_updated_at BEFORE UPDATE ON user_addresses 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_service_requests_updated_at BEFORE UPDATE ON service_requests 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
    CREATE TRIGGER update_service_feedback_updated_at BEFORE UPDATE ON service_feedback 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Trigger for generating request number
    CREATE TRIGGER trigger_generate_request_number 
        AFTER INSERT ON service_requests 
        FOR EACH ROW EXECUTE FUNCTION generate_request_number();

    -- Indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_service_requests_user_id ON service_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_service_requests_driver_id ON service_requests(driver_id);
    CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);
    CREATE INDEX IF NOT EXISTS idx_service_requests_date ON service_requests(preferred_date);
    CREATE INDEX IF NOT EXISTS idx_service_requests_request_number ON service_requests(request_number);
    
    CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_addresses_default ON user_addresses(user_id, is_default);
    
    CREATE INDEX IF NOT EXISTS idx_service_request_photos_request_id ON service_request_photos(service_request_id);
    CREATE INDEX IF NOT EXISTS idx_service_request_status_history_request_id ON service_request_status_history(service_request_id);
    CREATE INDEX IF NOT EXISTS idx_service_feedback_request_id ON service_feedback(service_request_id);
    CREATE INDEX IF NOT EXISTS idx_service_request_messages_request_id ON service_request_messages(service_request_id);

    -- Insert default service types
    INSERT INTO service_types (name, description, category, base_price, price_unit, requires_special_handling, estimated_duration_hours) VALUES 
        ('Construction Debris', 'Concrete, bricks, tiles, and other construction materials', 'construction', 150.00, 'per_bag', true, 2),
        ('Bulk Furniture', 'Large furniture items and appliances', 'bulk', 100.00, 'fixed', false, 1),
        ('Electronic Waste', 'Old computers, phones, and electronic devices', 'electronic', 50.00, 'fixed', true, 1),
        ('Garden Waste', 'Tree branches, grass clippings, and organic waste', 'organic', 75.00, 'per_bag', false, 1),
        ('Hazardous Materials', 'Paint, chemicals, and other hazardous substances', 'hazardous', 200.00, 'fixed', true, 3),
        ('General Bulk Waste', 'Mixed household items and general waste', 'general', 80.00, 'per_bag', false, 1)
    ON CONFLICT DO NOTHING;
  `);
};

module.exports.down = async function (knex) {
  await knex.raw(`
    -- Drop triggers first
    DROP TRIGGER IF EXISTS update_service_feedback_updated_at ON service_feedback;
    DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
    DROP TRIGGER IF EXISTS update_service_requests_updated_at ON service_requests;
    DROP TRIGGER IF EXISTS update_user_addresses_updated_at ON user_addresses;
    DROP TRIGGER IF EXISTS update_service_types_updated_at ON service_types;
    DROP TRIGGER IF EXISTS trigger_generate_request_number ON service_requests;
    
    -- Drop functions
    DROP FUNCTION IF EXISTS update_updated_at_column();
    DROP FUNCTION IF EXISTS generate_request_number();
    
    -- Drop tables in reverse order
    DROP TABLE IF EXISTS service_request_messages CASCADE;
    DROP TABLE IF EXISTS service_feedback CASCADE;
    DROP TABLE IF EXISTS service_request_status_history CASCADE;
    DROP TABLE IF EXISTS service_requests CASCADE;
    DROP TABLE IF EXISTS user_profiles CASCADE;
    DROP TABLE IF EXISTS service_types CASCADE;
  `);
};