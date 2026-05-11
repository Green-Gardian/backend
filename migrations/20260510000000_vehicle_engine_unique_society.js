module.exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE vehicle
        ADD COLUMN IF NOT EXISTS society_id INTEGER REFERENCES societies(id) ON DELETE SET NULL;

        CREATE INDEX IF NOT EXISTS idx_vehicle_society ON vehicle(society_id);
    `);
};

module.exports.down = async function (knex) {
    await knex.raw(`
        DROP INDEX IF EXISTS idx_vehicle_society;
        ALTER TABLE vehicle DROP COLUMN IF EXISTS society_id;
    `);
};
