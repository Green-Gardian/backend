// migrations/[timestamp]_add_chat_system.js
module.exports.up = async function (knex) {
  // Create the update function first
  await knex.raw(`
    -- Create 'chat' table for storing chats
    CREATE TABLE IF NOT EXISTS chat (
        id SERIAL PRIMARY KEY,
        society_id INTEGER REFERENCES societies(id) ON DELETE CASCADE,
        chatParticipants TEXT[] NOT NULL,  
        chatTitle TEXT NOT NULL, 
        lastMessage TEXT,
        status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'in-active','resolved')) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create 'MESSAGE' table for storing messages
    CREATE TABLE IF NOT EXISTS MESSAGE (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER REFERENCES chat(id) ON DELETE CASCADE,
        content TEXT NOT NULL,   
        sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sender_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better performance
    CREATE INDEX IF NOT EXISTS idx_chat_society_id 
        ON chat(society_id);
    
    CREATE INDEX IF NOT EXISTS idx_message_chat_id 
        ON MESSAGE(chat_id);
    
    CREATE INDEX IF NOT EXISTS idx_message_sender_id 
        ON MESSAGE(sender_id);

    -- Add triggers for updating timestamps on chat and MESSAGE tables
    CREATE TRIGGER update_chat_updated_at 
    BEFORE UPDATE ON chat 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_message_updated_at 
    BEFORE UPDATE ON MESSAGE 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Check if chat table exists, if not create it
  const chatTableExists = await knex.schema.hasTable('chat');
  if (!chatTableExists) {
    await knex.schema.createTable('chat', function (table) {
      table.increments('id').primary();
      table.integer('society_id').references('id').inTable('societies').onDelete('CASCADE');
      table.specificType('chatParticipants', 'TEXT[]').notNullable();
      table.text('chatTitle').notNullable();
      table.text('lastMessage');
      table.string('status', 50).notNullable().defaultTo('active').checkIn(['active', 'in-active', 'resolved']);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // Check if MESSAGE table exists, if not create it
  const messageTableExists = await knex.schema.hasTable('MESSAGE');
  if (!messageTableExists) {
    await knex.schema.createTable('MESSAGE', function (table) {
      table.increments('id').primary();
      table.integer('chat_id').references('id').inTable('chat').onDelete('CASCADE');
      table.text('content').notNullable();
      table.integer('sender_id').references('id').inTable('users').onDelete('SET NULL');
      table.text('sender_name').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // Create indexes (these are safe to run multiple times)
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_chat_society_id ON chat(society_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_message_chat_id ON MESSAGE(chat_id)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_message_sender_id ON MESSAGE(sender_id)');

  // Create triggers (check if they exist first)
  const chatTriggerExists = await knex.schema.raw(`
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_chat_updated_at'
  `);
  
  if (chatTriggerExists.rows.length === 0) {
    await knex.schema.raw(`
      CREATE TRIGGER update_chat_updated_at 
          BEFORE UPDATE ON chat 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  }
  
  const messageTriggerExists = await knex.schema.raw(`
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_message_updated_at'
  `);
  
  if (messageTriggerExists.rows.length === 0) {
    await knex.schema.raw(`
      CREATE TRIGGER update_message_updated_at 
          BEFORE UPDATE ON MESSAGE 
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
  }
};

module.exports.down = async function (knex) {
  // Drop triggers first
  await knex.schema.raw('DROP TRIGGER IF EXISTS update_message_updated_at ON MESSAGE');
  await knex.schema.raw('DROP TRIGGER IF EXISTS update_chat_updated_at ON chat');
  
  // Drop tables
  await knex.schema.dropTable('MESSAGE');
  await knex.schema.dropTable('chat');
  
  // Drop the function
  await knex.schema.raw('DROP FUNCTION IF EXISTS update_updated_at_column()');
};