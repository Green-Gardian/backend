
exports.up = function(knex) {
  return knex.schema.raw(`
    -- Drop the old check constraint
    ALTER TABLE users
    DROP CONSTRAINT users_role_check;
    
    -- Add a new check constraint with the new role included
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('driver', 'customer_support', 'admin', 'super_admin', 'resident', 'sub_admin));
  `);
};


exports.down = function(knex) {
  return knex.schema.raw(`
    -- Drop the updated check constraint
    ALTER TABLE users
    DROP CONSTRAINT users_role_check;
    
    -- Restore the original check constraint (without 'resident')
    ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('driver', 'customer_support', 'admin', 'super_admin'));
  `);
};