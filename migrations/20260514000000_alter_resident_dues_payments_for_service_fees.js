exports.up = async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE resident_dues_payments
      ADD COLUMN IF NOT EXISTS due_type VARCHAR(30);

    UPDATE resident_dues_payments
    SET due_type = 'monthly'
    WHERE due_type IS NULL;

    ALTER TABLE resident_dues_payments
      ALTER COLUMN due_type SET DEFAULT 'monthly',
      ALTER COLUMN due_type SET NOT NULL;

    ALTER TABLE resident_dues_payments
      ADD COLUMN IF NOT EXISTS service_request_id INTEGER REFERENCES service_requests(id) ON DELETE SET NULL;

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_user_id_billing_month_key;

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_due_type_check;

    ALTER TABLE resident_dues_payments
      ADD CONSTRAINT resident_dues_payments_due_type_check
      CHECK (due_type IN ('monthly', 'service_request'));

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_due_type_service_request_check;

    ALTER TABLE resident_dues_payments
      ADD CONSTRAINT resident_dues_payments_due_type_service_request_check
      CHECK (
        (due_type = 'monthly' AND service_request_id IS NULL)
        OR (due_type = 'service_request' AND service_request_id IS NOT NULL)
      );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_resident_dues_monthly_unique
      ON resident_dues_payments(user_id, billing_month)
      WHERE due_type = 'monthly' AND service_request_id IS NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_resident_dues_service_request_unique
      ON resident_dues_payments(service_request_id)
      WHERE due_type = 'service_request' AND service_request_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_resident_dues_user_status_type
      ON resident_dues_payments(user_id, status, due_type);
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    DROP INDEX IF EXISTS idx_resident_dues_user_status_type;
    DROP INDEX IF EXISTS idx_resident_dues_service_request_unique;
    DROP INDEX IF EXISTS idx_resident_dues_monthly_unique;

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_due_type_service_request_check;

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_due_type_check;

    ALTER TABLE resident_dues_payments
      DROP COLUMN IF EXISTS service_request_id;

    ALTER TABLE resident_dues_payments
      DROP COLUMN IF EXISTS due_type;

    ALTER TABLE resident_dues_payments
      ADD CONSTRAINT resident_dues_payments_user_id_billing_month_key UNIQUE (user_id, billing_month);
  `);
};
