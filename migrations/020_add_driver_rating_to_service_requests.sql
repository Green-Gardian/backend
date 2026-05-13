-- Migration: Add driver_rating column to service_requests table
-- This allows residents to rate drivers after service completion

-- Add driver_rating column (1-5 stars)
ALTER TABLE service_requests 
ADD COLUMN IF NOT EXISTS driver_rating INTEGER CHECK (driver_rating >= 1 AND driver_rating <= 5);

-- Add driver_rating_comment column for optional feedback
ALTER TABLE service_requests 
ADD COLUMN IF NOT EXISTS driver_rating_comment TEXT;

-- Add driver_rated_at timestamp
ALTER TABLE service_requests 
ADD COLUMN IF NOT EXISTS driver_rated_at TIMESTAMP;

-- Create index for faster rating queries
CREATE INDEX IF NOT EXISTS idx_service_requests_driver_rating 
ON service_requests(driver_id, driver_rating) 
WHERE driver_rating IS NOT NULL;

-- Add comment
COMMENT ON COLUMN service_requests.driver_rating IS 'Rating given by resident for driver service (1-5 stars)';
COMMENT ON COLUMN service_requests.driver_rating_comment IS 'Optional comment from resident about driver service';
COMMENT ON COLUMN service_requests.driver_rated_at IS 'Timestamp when the rating was submitted';
