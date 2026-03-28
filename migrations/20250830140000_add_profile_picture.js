exports.up = function(knex) {
  return knex.schema.raw(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_picture TEXT;
  `);
};

exports.down = function(knex) {
  return knex.schema.raw(`
    ALTER TABLE users
    DROP COLUMN IF EXISTS profile_picture;
  `);
};

