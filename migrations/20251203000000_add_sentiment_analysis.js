module.exports.up = async function (knex) {
  await knex.raw(`
    -- Add sentiment analysis fields to service_feedback table
    ALTER TABLE service_feedback 
    ADD COLUMN IF NOT EXISTS sentiment_score DECIMAL(3,2) 
      CHECK (sentiment_score >= -1.00 AND sentiment_score <= 1.00),
    ADD COLUMN IF NOT EXISTS sentiment_label VARCHAR(20) 
      CHECK (sentiment_label IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')),
    ADD COLUMN IF NOT EXISTS key_themes JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS requires_urgent_attention BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS aspect_sentiments JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS sentiment_summary TEXT,
    ADD COLUMN IF NOT EXISTS sentiment_analyzed_at TIMESTAMP;

    -- Create index for sentiment queries
    CREATE INDEX IF NOT EXISTS idx_service_feedback_sentiment_label 
      ON service_feedback(sentiment_label);
    
    CREATE INDEX IF NOT EXISTS idx_service_feedback_sentiment_score 
      ON service_feedback(sentiment_score DESC);
    
    CREATE INDEX IF NOT EXISTS idx_service_feedback_urgent 
      ON service_feedback(requires_urgent_attention) 
      WHERE requires_urgent_attention = true;

    -- Create sentiment analytics aggregate table
    CREATE TABLE IF NOT EXISTS sentiment_analytics (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('driver', 'service_type', 'society', 'overall')),
      entity_id INTEGER, -- NULL for 'overall' type
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      
      -- Aggregate metrics
      total_feedback_count INTEGER DEFAULT 0,
      avg_sentiment_score DECIMAL(4,2),
      avg_overall_rating DECIMAL(3,2),
      
      -- Distribution
      very_positive_count INTEGER DEFAULT 0,
      positive_count INTEGER DEFAULT 0,
      neutral_count INTEGER DEFAULT 0,
      negative_count INTEGER DEFAULT 0,
      very_negative_count INTEGER DEFAULT 0,
      
      -- Text analysis
      common_themes JSONB DEFAULT '[]'::jsonb,
      urgent_feedback_count INTEGER DEFAULT 0,
      
      -- Timestamps
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      -- Unique constraint to prevent duplicates
      UNIQUE(entity_type, entity_id, period_start, period_end)
    );

    -- Create indexes for sentiment_analytics
    CREATE INDEX IF NOT EXISTS idx_sentiment_analytics_entity 
      ON sentiment_analytics(entity_type, entity_id);
    
    CREATE INDEX IF NOT EXISTS idx_sentiment_analytics_period 
      ON sentiment_analytics(period_start, period_end);
    
    CREATE INDEX IF NOT EXISTS idx_sentiment_analytics_driver 
      ON sentiment_analytics(entity_type, entity_id) 
      WHERE entity_type = 'driver';

    -- Create trigger to update sentiment_analytics updated_at
    CREATE TRIGGER update_sentiment_analytics_updated_at 
      BEFORE UPDATE ON sentiment_analytics 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Add comment explaining the score range
    COMMENT ON COLUMN service_feedback.sentiment_score IS 
      'Sentiment score from -1.0 (very negative) to 1.0 (very positive)';
    
    COMMENT ON COLUMN service_feedback.sentiment_label IS 
      'Human-readable sentiment classification';
    
    COMMENT ON COLUMN service_feedback.key_themes IS 
      'Array of extracted themes/topics from feedback text';
    
    COMMENT ON COLUMN service_feedback.aspect_sentiments IS 
      'JSON object with sentiment for specific aspects: {timeliness, professionalism, cleanliness}';
  `);
};

module.exports.down = async function (knex) {
  await knex.raw(`
    -- Drop sentiment analytics table
    DROP TRIGGER IF EXISTS update_sentiment_analytics_updated_at ON sentiment_analytics;
    DROP TABLE IF EXISTS sentiment_analytics CASCADE;
    
    -- Drop indexes from service_feedback
    DROP INDEX IF EXISTS idx_service_feedback_urgent;
    DROP INDEX IF EXISTS idx_service_feedback_sentiment_score;
    DROP INDEX IF EXISTS idx_service_feedback_sentiment_label;
    
    -- Remove sentiment columns from service_feedback
    ALTER TABLE service_feedback 
    DROP COLUMN IF EXISTS sentiment_score,
    DROP COLUMN IF EXISTS sentiment_label,
    DROP COLUMN IF EXISTS key_themes,
    DROP COLUMN IF EXISTS requires_urgent_attention,
    DROP COLUMN IF EXISTS aspect_sentiments,
    DROP COLUMN IF EXISTS sentiment_summary,
    DROP COLUMN IF EXISTS sentiment_analyzed_at;
  `);
};
