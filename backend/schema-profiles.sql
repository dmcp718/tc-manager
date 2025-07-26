-- Job Profiles Table
CREATE TABLE cache_job_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    max_concurrent_files INTEGER DEFAULT 3,
    worker_count INTEGER DEFAULT 1,
    worker_poll_interval INTEGER DEFAULT 5000,
    
    -- File selection criteria
    min_file_size BIGINT DEFAULT 0,        -- bytes
    max_file_size BIGINT DEFAULT NULL,     -- bytes, NULL = no limit
    file_extensions TEXT[] DEFAULT NULL,   -- NULL = all extensions
    
    -- Performance tuning
    batch_timeout INTEGER DEFAULT 30000,   -- ms
    priority INTEGER DEFAULT 0,            -- higher = higher priority
    
    -- Metadata
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default profiles
INSERT INTO cache_job_profiles (name, description, max_concurrent_files, worker_count, min_file_size, max_file_size, file_extensions) VALUES
('small-files', 'Optimized for many small files (< 10MB)', 30, 2, 0, 10485760, NULL),
('large-videos', 'Optimized for large video files', 3, 1, 104857600, NULL, ARRAY['.mov', '.mp4', '.mxf', '.avi']),
('proxy-media', 'Proxy files and thumbnails', 20, 2, 0, 52428800, ARRAY['.jpg', '.jpeg', '.png', '.mp4', '.mov']),
('documents', 'Office documents and PDFs', 10, 1, 0, 10485760, ARRAY['.pdf', '.doc', '.docx', '.xls', '.xlsx']),
('general', 'Balanced for mixed content', 5, 1, 0, NULL, NULL);

-- Set general as default
UPDATE cache_job_profiles SET is_default = TRUE WHERE name = 'general';

-- Add profile_id to cache_jobs table
ALTER TABLE cache_jobs ADD COLUMN profile_id UUID REFERENCES cache_job_profiles(id);