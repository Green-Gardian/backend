exports.up = async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS resident_dues_payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      society_id INTEGER REFERENCES societies(id) ON DELETE SET NULL,
      billing_month DATE NOT NULL,
      due_date DATE NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'pkr',
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'failed', 'cancelled')),
      paid_at TIMESTAMP,
      stripe_checkout_session_id VARCHAR(255) UNIQUE,
      stripe_payment_intent_id VARCHAR(255),
      stripe_customer_id VARCHAR(255),
      stripe_payment_status VARCHAR(50),
      payment_method VARCHAR(100),
      receipt_url TEXT,
      failure_reason TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, billing_month)
    );

    CREATE INDEX IF NOT EXISTS idx_resident_dues_payments_user_month
      ON resident_dues_payments(user_id, billing_month DESC);

    CREATE INDEX IF NOT EXISTS idx_resident_dues_payments_status
      ON resident_dues_payments(status);

    CREATE INDEX IF NOT EXISTS idx_resident_dues_payments_society_month
      ON resident_dues_payments(society_id, billing_month DESC);
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP TABLE IF EXISTS resident_dues_payments;
  `);
};
