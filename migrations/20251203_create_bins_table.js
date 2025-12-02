// migrations/20251203_create_bins_table.js
module.exports.up = async function (knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS bins (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255),
      address TEXT,
      society VARCHAR(255),
      latitude DECIMAL(10,6) DEFAULT 0.000000,
      longitude DECIMAL(10,6) DEFAULT 0.000000,
      fill_level DECIMAL(5,2) DEFAULT 0.00,
      temperature DOUBLE PRECISION,
      humidity DOUBLE PRECISION,
      smoke_level INTEGER DEFAULT 0,
      distances JSONB DEFAULT '{"d1":"","d2":"","d3":"","d4":""}',
      valid_sensors INTEGER DEFAULT 0,
      avg_distance VARCHAR(50) DEFAULT 'N/A',
      status VARCHAR(50) DEFAULT 'idle',
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_bins_society ON bins(society);
  `);
};

module.exports.down = async function (knex) {
  await knex.raw(`
    DROP TABLE IF EXISTS bins;
  `);
};
