const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    PORT: process.env.DB_PORT
});

const initDb = async () => {
    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                username VARCHAR(255) UNIQUE NOT NULL,
                phone_number VARCHAR(15) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash TEXT,
                role VARCHAR(50) NOT NULL CHECK (role IN ('driver', 'customer_support' , 'admin', 'super_admin')),
                society_id INTEGER REFERENCES societies(id) ON DELETE CASCADE,
                is_verified BOOLEAN DEFAULT FALSE,
                is_blocked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS email_verification_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                is_used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            );
            `);

        // Add password reset tokens table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                is_used BOOLEAN DEFAULT FALSE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS societies (
                id SERIAL PRIMARY KEY,
                society_name TEXT NOT NULL,
                address TEXT,
                city VARCHAR(255),
                state VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS society_license (
                id SERIAL PRIMARY KEY,
                society_id INTEGER REFERENCES societies(id) ON DELETE CASCADE,
                license_key TEXT NOT NULL,
                valid_from TIMESTAMP NOT NULL,
                valid_until TIMESTAMP NOT NULL,
                max_residents INTEGER NOT NULL,
                max_drivers INTEGER NOT NULL,
                max_bins INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`);

        // Alert Broadcasting System Tables
        await pool.query(`
            CREATE TABLE IF NOT EXISTS alert_types (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS alert_templates (
                id SERIAL PRIMARY KEY,
                alert_type_id INTEGER REFERENCES alert_types(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                email_subject VARCHAR(255),
                email_body TEXT,
                sms_message VARCHAR(160),
                push_title VARCHAR(100),
                push_body TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_notification_preferences (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                alert_type_id INTEGER REFERENCES alert_types(id) ON DELETE CASCADE,
                email_enabled BOOLEAN DEFAULT TRUE,
                sms_enabled BOOLEAN DEFAULT TRUE,
                push_enabled BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, alert_type_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS alerts (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                alert_type_id INTEGER REFERENCES alert_types(id) ON DELETE CASCADE,
                society_id INTEGER REFERENCES societies(id) ON DELETE CASCADE,
                sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
                scheduled_for TIMESTAMP,
                expires_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS alert_recipients (
                id SERIAL PRIMARY KEY,
                alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                email_sent BOOLEAN DEFAULT FALSE,
                sms_sent BOOLEAN DEFAULT FALSE,
                push_sent BOOLEAN DEFAULT FALSE,
                email_sent_at TIMESTAMP,
                sms_sent_at TIMESTAMP,
                push_sent_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(alert_id, user_id)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS communication_logs (
                id SERIAL PRIMARY KEY,
                alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
                status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
                message_id VARCHAR(255),
                error_message TEXT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                delivery_status VARCHAR(20) DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'failed', 'bounced'))
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS push_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                device_type VARCHAR(20) CHECK (device_type IN ('web', 'android', 'ios')),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token 
            ON password_reset_tokens(token);
            `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
            ON password_reset_tokens(user_id);
            `);

        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS society_id INTEGER REFERENCES societies(id) ON DELETE SET NULL;
            `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_society_id 
            ON users(society_id);
            `);

        // Alert System Indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_alerts_society_id 
            ON alerts(society_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_alerts_status 
            ON alerts(status);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_alerts_scheduled_for 
            ON alerts(scheduled_for);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_alert_recipients_alert_id 
            ON alert_recipients(alert_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_communication_logs_alert_id 
            ON communication_logs(alert_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id 
            ON push_tokens(user_id);
        `);

        // Insert default alert types
        await pool.query(`
            INSERT INTO alert_types (name, description, priority) VALUES 
            ('system_maintenance', 'System maintenance and updates', 'medium'),
            ('emergency', 'Emergency situations and critical alerts', 'critical'),
            ('schedule_change', 'Schedule changes and updates', 'medium'),
            ('reminder', 'General reminders and notifications', 'low'),
            ('security', 'Security alerts and warnings', 'high'),
            ('maintenance', 'Maintenance and service notifications', 'medium')
            ON CONFLICT (name) DO NOTHING;
        `);

        console.log("Database initialized.")
    }
    catch (error) {
        console.log("Error initializing Database.", error.message)
    }
}

module.exports = { pool, initDb };