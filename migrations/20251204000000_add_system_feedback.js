module.exports.up = async function (knex) {
    await knex.raw(`
    -- Create enum type for feedback categories/modules
    CREATE TYPE feedback_category AS ENUM (
      'dashboard',
      'alerts',
      'vehicles',
      'service_requests',
      'messaging',
      'analytics',
      'profile',
      'mobile_app',
      'driver_app',
      'admin_panel',
      'payment',
      'other'
    );

    -- Create enum type for feedback type
    CREATE TYPE feedback_type AS ENUM (
      'bug_report',
      'feature_request',
      'improvement',
      'complaint',
      'praise',
      'general'
    );

    -- System Feedback Table (for app/software feedback)
    CREATE TABLE IF NOT EXISTS system_feedback (
      id SERIAL PRIMARY KEY,
      
      -- User who submitted feedback
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      user_role VARCHAR(50), -- Store role at submission time for analytics
      society_id INTEGER REFERENCES societies(id) ON DELETE SET NULL,
      
      -- Feedback Classification
      category feedback_category NOT NULL,
      feedback_type feedback_type NOT NULL,
      priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      
      -- Feedback Content
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      steps_to_reproduce TEXT, -- For bug reports
      expected_behavior TEXT, -- For bug reports
      actual_behavior TEXT, -- For bug reports
      
      -- Optional: Screenshot/attachment URL
      screenshot_url TEXT,
      device_info JSONB DEFAULT '{}'::jsonb, -- Device type, OS, browser, app version
      
      -- Rating (optional, 1-5)
      rating INTEGER CHECK (rating >= 1 AND rating <= 5),
      
      -- Sentiment Analysis (AI-generated)
      sentiment_score DECIMAL(3,2) CHECK (sentiment_score >= -1.00 AND sentiment_score <= 1.00),
      sentiment_label VARCHAR(20) CHECK (sentiment_label IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')),
      key_themes JSONB DEFAULT '[]'::jsonb,
      requires_urgent_attention BOOLEAN DEFAULT false,
      sentiment_summary TEXT,
      sentiment_analyzed_at TIMESTAMP,
      
      -- Status Tracking
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN (
        'open', 'acknowledged', 'in_progress', 'resolved', 'closed', 'wont_fix'
      )),
      
      -- Admin Response
      admin_response TEXT,
      admin_responded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      admin_responded_at TIMESTAMP,
      resolution_notes TEXT,
      resolved_at TIMESTAMP,
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      
      -- Metadata
      is_public BOOLEAN DEFAULT false, -- Can be shared publicly (feature board)
      upvotes INTEGER DEFAULT 0, -- Other users can upvote
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- System Feedback Upvotes (users can upvote feedback)
    CREATE TABLE IF NOT EXISTS system_feedback_upvotes (
      id SERIAL PRIMARY KEY,
      feedback_id INTEGER REFERENCES system_feedback(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(feedback_id, user_id)
    );

    -- System Feedback Comments (internal discussions)
    CREATE TABLE IF NOT EXISTS system_feedback_comments (
      id SERIAL PRIMARY KEY,
      feedback_id INTEGER REFERENCES system_feedback(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      comment_text TEXT NOT NULL,
      is_internal BOOLEAN DEFAULT true, -- Only visible to admins
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_system_feedback_user_id ON system_feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_system_feedback_category ON system_feedback(category);
    CREATE INDEX IF NOT EXISTS idx_system_feedback_type ON system_feedback(feedback_type);
    CREATE INDEX IF NOT EXISTS idx_system_feedback_status ON system_feedback(status);
    CREATE INDEX IF NOT EXISTS idx_system_feedback_sentiment ON system_feedback(sentiment_label);
    CREATE INDEX IF NOT EXISTS idx_system_feedback_urgent ON system_feedback(requires_urgent_attention) 
      WHERE requires_urgent_attention = true;
    CREATE INDEX IF NOT EXISTS idx_system_feedback_created ON system_feedback(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_system_feedback_role ON system_feedback(user_role);
    
    CREATE INDEX IF NOT EXISTS idx_system_feedback_upvotes_feedback ON system_feedback_upvotes(feedback_id);
    CREATE INDEX IF NOT EXISTS idx_system_feedback_comments_feedback ON system_feedback_comments(feedback_id);

    -- Trigger for updating updated_at
    CREATE TRIGGER update_system_feedback_updated_at 
      BEFORE UPDATE ON system_feedback 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_system_feedback_comments_updated_at 
      BEFORE UPDATE ON system_feedback_comments 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    -- Trigger to update upvotes count
    CREATE OR REPLACE FUNCTION update_feedback_upvotes()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE system_feedback SET upvotes = upvotes + 1 WHERE id = NEW.feedback_id;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE system_feedback SET upvotes = upvotes - 1 WHERE id = OLD.feedback_id;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trigger_update_feedback_upvotes
      AFTER INSERT OR DELETE ON system_feedback_upvotes
      FOR EACH ROW EXECUTE FUNCTION update_feedback_upvotes();

    -- Comments
    COMMENT ON TABLE system_feedback IS 'System-wide feedback about the application from all users';
    COMMENT ON COLUMN system_feedback.category IS 'Which module/feature this feedback is about';
    COMMENT ON COLUMN system_feedback.feedback_type IS 'Type of feedback: bug, feature request, etc.';
    COMMENT ON COLUMN system_feedback.user_role IS 'Role of user at time of submission for analytics';
    COMMENT ON COLUMN system_feedback.device_info IS 'JSON with device/browser/app version information';
  `);
};

module.exports.down = async function (knex) {
    await knex.raw(`
    -- Drop triggers
    DROP TRIGGER IF EXISTS trigger_update_feedback_upvotes ON system_feedback_upvotes;
    DROP TRIGGER IF EXISTS update_system_feedback_comments_updated_at ON system_feedback_comments;
    DROP TRIGGER IF EXISTS update_system_feedback_updated_at ON system_feedback;
    
    -- Drop function
    DROP FUNCTION IF EXISTS update_feedback_upvotes();
    
    -- Drop indexes
    DROP INDEX IF EXISTS idx_system_feedback_comments_feedback;
    DROP INDEX IF EXISTS idx_system_feedback_upvotes_feedback;
    DROP INDEX IF EXISTS idx_system_feedback_role;
    DROP INDEX IF EXISTS idx_system_feedback_created;
    DROP INDEX IF EXISTS idx_system_feedback_urgent;
    DROP INDEX IF EXISTS idx_system_feedback_sentiment;
    DROP INDEX IF EXISTS idx_system_feedback_status;
    DROP INDEX IF EXISTS idx_system_feedback_type;
    DROP INDEX IF EXISTS idx_system_feedback_category;
    DROP INDEX IF EXISTS idx_system_feedback_user_id;
    
    -- Drop tables
    DROP TABLE IF EXISTS system_feedback_comments CASCADE;
    DROP TABLE IF EXISTS system_feedback_upvotes CASCADE;
    DROP TABLE IF EXISTS system_feedback CASCADE;
    
    -- Drop enums
    DROP TYPE IF EXISTS feedback_type;
    DROP TYPE IF EXISTS feedback_category;
  `);
};
