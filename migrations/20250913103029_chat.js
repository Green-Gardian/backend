// migrations/[timestamp]_add_chat_system.js
module.exports.up = async function (knex) {
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
  `);
};

module.exports.down = async function (knex) {
  await knex.raw(`
    -- Drop triggers first
    DROP TRIGGER IF EXISTS update_message_updated_at ON MESSAGE;
    DROP TRIGGER IF EXISTS update_chat_updated_at ON chat;
    
    -- Drop tables in reverse order
    DROP TABLE IF EXISTS MESSAGE CASCADE;
    DROP TABLE IF EXISTS chat CASCADE;
  `);
};