-- Video Preview Jobs Schema
-- This schema supports batch video preview generation using a job queue system

-- Video preview job profiles for different transcoding strategies
CREATE TABLE video_preview_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    max_concurrent_files INTEGER DEFAULT 2,
    worker_count INTEGER DEFAULT 1,
    worker_poll_interval INTEGER DEFAULT 5000,
    
    -- Video transcoding settings
    video_bitrate TEXT DEFAULT '1000k',
    video_maxrate TEXT DEFAULT '1500k',
    video_width INTEGER DEFAULT 1280,
    video_height INTEGER DEFAULT 720,
    segment_duration INTEGER DEFAULT 4,
    
    -- Performance tuning
    priority INTEGER DEFAULT 0,
    
    -- Metadata
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Video preview jobs table
CREATE TABLE video_preview_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused', 'cancelled')),
    file_paths TEXT[] NOT NULL,
    directory_paths TEXT[] DEFAULT '{}',
    total_files INTEGER NOT NULL,
    completed_files INTEGER DEFAULT 0,
    failed_files INTEGER DEFAULT 0,
    skipped_files INTEGER DEFAULT 0, -- For already transcoded or web-compatible videos
    worker_id TEXT,
    profile_id UUID REFERENCES video_preview_profiles(id),
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Individual preview items for granular tracking
CREATE TABLE video_preview_job_items (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID REFERENCES video_preview_jobs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'skipped')),
    skip_reason TEXT, -- 'web_compatible', 'already_transcoded', 'not_video'
    cache_key TEXT, -- For tracking generated preview
    preview_path TEXT, -- Path to generated preview files
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    worker_id TEXT,
    duration_seconds REAL -- Time taken to transcode
);

-- Indexes for performance
CREATE INDEX idx_video_preview_jobs_status ON video_preview_jobs(status);
CREATE INDEX idx_video_preview_jobs_created_at ON video_preview_jobs(created_at DESC);
CREATE INDEX idx_video_preview_job_items_job_id ON video_preview_job_items(job_id);
CREATE INDEX idx_video_preview_job_items_status ON video_preview_job_items(status);
CREATE INDEX idx_video_preview_job_items_file_path ON video_preview_job_items(file_path);

-- Insert default profiles
INSERT INTO video_preview_profiles (name, description, max_concurrent_files, worker_count, video_bitrate, video_width, video_height) VALUES
('standard', 'Standard quality for general use', 2, 1, '1000k', 1280, 720),
('high-quality', 'Higher quality for important content', 1, 1, '2500k', 1920, 1080),
('fast-preview', 'Fast processing for quick previews', 3, 2, '750k', 854, 480),
('4k-preview', '4K preview generation', 1, 1, '6000k', 3840, 2160);

-- Update the default profile
UPDATE video_preview_profiles SET is_default = true WHERE name = 'standard';

-- Function to get video preview statistics
CREATE OR REPLACE FUNCTION get_video_preview_stats()
RETURNS TABLE(
    total_jobs BIGINT,
    pending_jobs BIGINT,
    running_jobs BIGINT,
    completed_jobs BIGINT,
    failed_jobs BIGINT,
    total_videos_processed BIGINT,
    total_videos_skipped BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_jobs,
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT as pending_jobs,
        COUNT(*) FILTER (WHERE status = 'running')::BIGINT as running_jobs,
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT as completed_jobs,
        COUNT(*) FILTER (WHERE status = 'failed')::BIGINT as failed_jobs,
        COALESCE(SUM(completed_files), 0)::BIGINT as total_videos_processed,
        COALESCE(SUM(skipped_files), 0)::BIGINT as total_videos_skipped
    FROM video_preview_jobs;
END;
$$ LANGUAGE plpgsql;