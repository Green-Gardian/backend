module.exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE societies
        ADD COLUMN IF NOT EXISTS registration_number VARCHAR(100) UNIQUE,
        ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
        ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
        ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20);

        CREATE INDEX IF NOT EXISTS idx_societies_registration ON societies(registration_number);
    `);
};

module.exports.down = async function (knex) {
    await knex.raw(`
        DROP INDEX IF EXISTS idx_societies_registration;
        ALTER TABLE societies
        DROP COLUMN IF EXISTS registration_number,
        DROP COLUMN IF EXISTS postal_code,
        DROP COLUMN IF EXISTS contact_email,
        DROP COLUMN IF EXISTS contact_phone;
    `);
};
