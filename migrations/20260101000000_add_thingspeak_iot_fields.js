// migrations/20260101000000_add_thingspeak_iot_fields.js
// Adds ThingSpeak IoT integration fields to bins table
module.exports.up = async function (knex) {
    await knex.raw(`
    -- Add ThingSpeak configuration fields
    ALTER TABLE bins ADD COLUMN IF NOT EXISTS thingspeak_channel_id VARCHAR(50);
    ALTER TABLE bins ADD COLUMN IF NOT EXISTS thingspeak_api_key VARCHAR(100);
    
    -- Add IoT tracking fields
    ALTER TABLE bins ADD COLUMN IF NOT EXISTS iot_last_update TIMESTAMP;
    ALTER TABLE bins ADD COLUMN IF NOT EXISTS iot_entry_id INTEGER;
    ALTER TABLE bins ADD COLUMN IF NOT EXISTS raw_distance DECIMAL(10,2);
    
    -- Add index for ThingSpeak channel lookup
    CREATE INDEX IF NOT EXISTS idx_bins_thingspeak_channel ON bins(thingspeak_channel_id);
    
    COMMENT ON COLUMN bins.thingspeak_channel_id IS 'ThingSpeak channel ID for this IoT bin';
    COMMENT ON COLUMN bins.thingspeak_api_key IS 'ThingSpeak Read API key for this channel';
    COMMENT ON COLUMN bins.iot_last_update IS 'Timestamp of last IoT data received';
    COMMENT ON COLUMN bins.iot_entry_id IS 'Last ThingSpeak entry ID processed';
    COMMENT ON COLUMN bins.raw_distance IS 'Raw distance reading from ultrasonic sensor (cm)';
  `);
};

module.exports.down = async function (knex) {
    await knex.raw(`
    ALTER TABLE bins DROP COLUMN IF EXISTS thingspeak_channel_id;
    ALTER TABLE bins DROP COLUMN IF EXISTS thingspeak_api_key;
    ALTER TABLE bins DROP COLUMN IF EXISTS iot_last_update;
    ALTER TABLE bins DROP COLUMN IF EXISTS iot_entry_id;
    ALTER TABLE bins DROP COLUMN IF EXISTS raw_distance;
    DROP INDEX IF EXISTS idx_bins_thingspeak_channel;
  `);
};
