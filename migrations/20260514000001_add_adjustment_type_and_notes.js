exports.up = async function up(knex) {
  await knex.schema.raw(`
    ALTER TABLE resident_dues_payments
      ADD COLUMN IF NOT EXISTS notes TEXT;

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_due_type_check;

    ALTER TABLE resident_dues_payments
      ADD CONSTRAINT resident_dues_payments_due_type_check
      CHECK (due_type IN ('monthly', 'service_request', 'adjustment'));

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_due_type_service_request_check;

    ALTER TABLE resident_dues_payments
      ADD CONSTRAINT resident_dues_payments_due_type_service_request_check
      CHECK (
        (due_type = 'monthly' AND service_request_id IS NULL)
        OR (due_type = 'service_request' AND service_request_id IS NOT NULL)
        OR (due_type = 'adjustment' AND service_request_id IS NULL)
      );
  `);
};

exports.down = async function down(knex) {
  await knex.schema.raw(`
    ALTER TABLE resident_dues_payments
      DROP COLUMN IF EXISTS notes;

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_due_type_service_request_check;

    ALTER TABLE resident_dues_payments
      ADD CONSTRAINT resident_dues_payments_due_type_service_request_check
      CHECK (
        (due_type = 'monthly' AND service_request_id IS NULL)
        OR (due_type = 'service_request' AND service_request_id IS NOT NULL)
      );

    ALTER TABLE resident_dues_payments
      DROP CONSTRAINT IF EXISTS resident_dues_payments_due_type_check;

    ALTER TABLE resident_dues_payments
      ADD CONSTRAINT resident_dues_payments_due_type_check
      CHECK (due_type IN ('monthly', 'service_request'));
  `);
};
