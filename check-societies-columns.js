const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'societies'
      ORDER BY ordinal_position;
    `);
    console.log('Societies table columns:');
    result.rows.forEach(row => console.log(`  - ${row.column_name}: ${row.data_type}`));
  } finally {
    await pool.end();
  }
})();
