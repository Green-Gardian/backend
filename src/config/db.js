const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const initDb = async () => {
  try {
    // Create 'users' table
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
            );
        `);

    // Create 'email_verification_tokens' table
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

    // Create 'password_reset_tokens' table
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

    // Create 'societies' table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS societies (
                id SERIAL PRIMARY KEY,
                society_name TEXT NOT NULL,
                address TEXT,
                city VARCHAR(255),
                state VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

    // Create 'society_license' table
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
            );
        `);

    // Create 'refresh_tokens' table
    await pool.query(`
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

    // Create index on password_reset_tokens table
    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token 
            ON password_reset_tokens(token);
        `);

    // Create index on password_reset_tokens table (user_id)
    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id 
            ON password_reset_tokens(user_id);
        `);

    // Alter users table to add society_id column
    await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS society_id INTEGER REFERENCES societies(id) ON DELETE SET NULL;
        `);

    // Create index on users table (society_id)
    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_society_id 
            ON users(society_id);
        `);

    // Create 'chat' table for storing chats
    await pool.query(`
            CREATE TABLE IF NOT EXISTS chat (
                id SERIAL PRIMARY KEY,
                society_id INTEGER REFERENCES societies(id) ON DELETE CASCADE,
                chatParticipants TEXT[] NOT NULL,  
                chatTitle TEXT NOT NULL, 
                lastMessage TEXT ,
                status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'in-active','resolved')) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

    // Create 'MESSAGE' table for storing messages
    await pool.query(`
            CREATE TABLE IF NOT EXISTS MESSAGE (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER REFERENCES chat(id) ON DELETE CASCADE,
                content TEXT NOT NULL,   
                sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                sender_name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

    console.log("Database initialized.");
  } catch (error) {
    console.log("Error initializing Database:", error.message);
  }
};

module.exports = { pool, initDb };
