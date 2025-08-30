// check-db.js
const knex = require('knex');
const config = require('./knexfile'); // adjust path if needed

// use your "development" config
const db = knex(config.development);

async function main() {
  const result = await db.raw('SELECT current_database();');
  console.log('Connected to DB:', result.rows[0].current_database);
  await db.destroy();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});