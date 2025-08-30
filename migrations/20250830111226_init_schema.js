// migrations/20250830111226_init_schema.js
module.exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      phone_number VARCHAR(15) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT,
      role VARCHAR(50) NOT NULL CHECK (role IN ('driver', 'customer_support' , 'admin', 'super_admin')),
      is_verified BOOLEAN DEFAULT FALSE,
      is_blocked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

module.exports.down = async function (knex) {
  await knex.raw(`DROP TABLE IF EXISTS users CASCADE`);
};
