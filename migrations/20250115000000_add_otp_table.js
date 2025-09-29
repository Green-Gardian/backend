exports.up = function(knex) {
  return knex.schema.createTable('password_reset_otps', function(table) {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('otp', 6).notNullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('is_used').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index(['user_id', 'otp']);
    table.index(['otp', 'expires_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('password_reset_otps');
};
