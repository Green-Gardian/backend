const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: false,
});

async function testDuesQuery() {
  try {
    console.log("Testing database connection...");
    const connTest = await pool.query("SELECT NOW()");
    console.log("✓ Database connected:", connTest.rows[0]);

    // Check if table exists
    console.log("\nChecking resident_dues_payments table...");
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'resident_dues_payments'
      );
    `);
    console.log("✓ Table exists:", tableCheck.rows[0].exists);

    // Check table structure
    if (tableCheck.rows[0].exists) {
      const schemaCheck = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'resident_dues_payments'
        ORDER BY ordinal_position;
      `);
      console.log("\n✓ Table columns:");
      schemaCheck.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });

      // Count records
      const countCheck = await pool.query("SELECT COUNT(*) FROM resident_dues_payments;");
      console.log("\n✓ Total records in table:", countCheck.rows[0].count);

      // Check for March 2026 records
      const marchCheck = await pool.query(
        "SELECT COUNT(*) FROM resident_dues_payments WHERE billing_month = $1",
        ["2026-03-01"]
      );
      console.log("✓ Records for 2026-03-01:", marchCheck.rows[0].count);

      // Check available months
      const monthsCheck = await pool.query(`
        SELECT DISTINCT billing_month FROM resident_dues_payments ORDER BY billing_month DESC LIMIT 10;
      `);
      console.log("\n✓ Available billing months:");
      monthsCheck.rows.forEach(row => {
        console.log(`  - ${row.billing_month}`);
      });
    }

    // Test the problematic query
    console.log("\nTesting the admin records query...");
    const scopeSocietyId = null; // super_admin
    const month = "2026-03";
    const status = null;
    const search = null;
    const limit = 10;
    const offset = 0;

    const filters = [scopeSocietyId, month ? `${month}-01` : null, status, search ? `%${search}%` : null, limit, offset];
    console.log("Query filters:", filters);

    const recordsQ = await pool.query(
      `
        SELECT
          rdp.id,
          rdp.user_id,
          rdp.society_id,
          rdp.billing_month,
          rdp.due_date,
          rdp.amount_cents,
          rdp.currency,
          rdp.status,
          rdp.paid_at,
          rdp.payment_method,
          rdp.stripe_checkout_session_id,
          rdp.stripe_payment_intent_id,
          rdp.receipt_url,
          rdp.updated_at,
          u.first_name,
          u.last_name,
          u.email,
          u.phone_number,
          ua.apartment_unit,
          ua.street_address,
          ua.city,
          s.society_name AS society_name
        FROM resident_dues_payments rdp
        JOIN users u ON u.id = rdp.user_id
        LEFT JOIN user_addresses ua ON ua.user_id = u.id AND ua.is_default = true AND ua.is_active = true
        LEFT JOIN societies s ON s.id = rdp.society_id
        WHERE ($1::int IS NULL OR rdp.society_id = $1)
          AND ($2::date IS NULL OR rdp.billing_month = $2)
          AND ($3::text IS NULL OR rdp.status = $3)
          AND (
            $4::text IS NULL OR
            LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE $4 OR
            LOWER(COALESCE(u.email, '')) LIKE $4 OR
            LOWER(COALESCE(u.phone_number, '')) LIKE $4
          )
        ORDER BY rdp.billing_month DESC, rdp.updated_at DESC
        LIMIT $5 OFFSET $6
      `,
      filters
    );

    console.log("✓ Query successful!");
    console.log("✓ Records returned:", recordsQ.rows.length);
    if (recordsQ.rows.length > 0) {
      console.log("Sample record:", JSON.stringify(recordsQ.rows[0], null, 2));
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error("Full error:", error);
  } finally {
    await pool.end();
  }
}

testDuesQuery();
