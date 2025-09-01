-- Migration: Add multi-filespace support
-- Date: 2025-08-31
-- Description: Add filespace tracking to support multiple LucidLink filespaces

BEGIN;

-- Add filespace columns to files table
ALTER TABLE files 
ADD COLUMN IF NOT EXISTS filespace_id INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS filespace_name TEXT,
ADD COLUMN IF NOT EXISTS mount_point TEXT;

-- Update existing records to have filespace_id = 1 and default mount point
UPDATE files 
SET filespace_id = 1,
    mount_point = '/media/lucidlink-1'
WHERE filespace_id IS NULL;

-- Add composite index for filespace queries
CREATE INDEX IF NOT EXISTS idx_files_filespace_path 
ON files(filespace_id, path);

CREATE INDEX IF NOT EXISTS idx_files_filespace_parent 
ON files(filespace_id, parent_path);

-- Add filespace tracking to cache_jobs table
ALTER TABLE cache_jobs
ADD COLUMN IF NOT EXISTS filespace_id INTEGER DEFAULT 1;

-- Add filespace tracking to cache_job_items table
ALTER TABLE cache_job_items
ADD COLUMN IF NOT EXISTS filespace_id INTEGER DEFAULT 1;

-- Create filespaces configuration table
CREATE TABLE IF NOT EXISTS filespaces (
    id SERIAL PRIMARY KEY,
    filespace_name TEXT NOT NULL,
    mount_point TEXT NOT NULL,
    instance_id INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default filespace if not exists
INSERT INTO filespaces (id, filespace_name, mount_point, instance_id)
VALUES (1, 'primary', '/media/lucidlink-1', 2001)
ON CONFLICT (id) DO NOTHING;

-- Add filespace tracking to index_progress table
ALTER TABLE index_progress
ADD COLUMN IF NOT EXISTS filespace_id INTEGER DEFAULT 1;

-- Add filespace tracking to video_preview_jobs table
ALTER TABLE video_preview_jobs
ADD COLUMN IF NOT EXISTS filespace_id INTEGER DEFAULT 1;

-- Update the unique constraint on files table to include filespace_id
-- First drop the old unique constraint if it exists
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_path_key;

-- Add new unique constraint that includes filespace_id
ALTER TABLE files 
ADD CONSTRAINT files_filespace_path_unique UNIQUE (filespace_id, path);

-- Create a view for easy filespace statistics
CREATE OR REPLACE VIEW filespace_stats AS
SELECT 
    f.filespace_id,
    fs.filespace_name,
    fs.mount_point,
    COUNT(*) as total_files,
    COUNT(CASE WHEN f.is_directory = true THEN 1 END) as total_directories,
    COUNT(CASE WHEN f.cached = true THEN 1 END) as cached_files,
    SUM(f.size) as total_size,
    SUM(CASE WHEN f.cached = true THEN f.size ELSE 0 END) as cached_size
FROM files f
LEFT JOIN filespaces fs ON f.filespace_id = fs.id
GROUP BY f.filespace_id, fs.filespace_name, fs.mount_point;

COMMIT;