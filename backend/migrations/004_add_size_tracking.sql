-- Migration: Add size tracking to cache jobs
-- Created: 2025-08-23

-- Add size columns to cache_jobs table
ALTER TABLE cache_jobs 
ADD COLUMN IF NOT EXISTS total_size_bytes BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_size_bytes BIGINT DEFAULT 0;

-- Add size column to cache_job_items table
ALTER TABLE cache_job_items 
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;

-- Create index for faster size calculations
CREATE INDEX IF NOT EXISTS idx_cache_job_items_size 
ON cache_job_items(job_id, status, file_size_bytes) 
WHERE status = 'completed';

-- Update existing records with file sizes from files table if available
UPDATE cache_job_items cji
SET file_size_bytes = COALESCE(f.size, 0)
FROM files f
WHERE cji.file_path = f.path
AND cji.file_size_bytes = 0;

-- Update total_size_bytes for existing jobs
UPDATE cache_jobs cj
SET total_size_bytes = (
    SELECT COALESCE(SUM(file_size_bytes), 0)
    FROM cache_job_items
    WHERE job_id = cj.id
)
WHERE total_size_bytes = 0;

-- Update completed_size_bytes for existing jobs
UPDATE cache_jobs cj
SET completed_size_bytes = (
    SELECT COALESCE(SUM(file_size_bytes), 0)
    FROM cache_job_items
    WHERE job_id = cj.id
    AND status = 'completed'
)
WHERE completed_size_bytes = 0;

-- Add comment to columns
COMMENT ON COLUMN cache_jobs.total_size_bytes IS 'Total size of all files in the job in bytes';
COMMENT ON COLUMN cache_jobs.completed_size_bytes IS 'Total size of completed files in bytes';
COMMENT ON COLUMN cache_job_items.file_size_bytes IS 'Size of the individual file in bytes';