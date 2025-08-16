-- Performance optimization indexes for production
-- TeamCache Manager v1.7.0

-- Files table indexes
CREATE INDEX IF NOT EXISTS idx_files_parent_path ON files(parent_path);
CREATE INDEX IF NOT EXISTS idx_files_is_cached ON files(is_cached);
CREATE INDEX IF NOT EXISTS idx_files_size ON files(size);
CREATE INDEX IF NOT EXISTS idx_files_modified_time ON files(modified_time);
CREATE INDEX IF NOT EXISTS idx_files_indexed_at ON files(indexed_at);
CREATE INDEX IF NOT EXISTS idx_files_composite_query ON files(parent_path, is_directory, name);

-- Cache jobs indexes
CREATE INDEX IF NOT EXISTS idx_cache_jobs_status ON cache_jobs(status);
CREATE INDEX IF NOT EXISTS idx_cache_jobs_created_at ON cache_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_job_items_status ON cache_job_items(status);
CREATE INDEX IF NOT EXISTS idx_cache_job_items_job_status ON cache_job_items(job_id, status);
CREATE INDEX IF NOT EXISTS idx_cache_job_items_worker ON cache_job_items(worker_id, status);

-- Index progress tracking
CREATE INDEX IF NOT EXISTS idx_index_progress_status ON index_progress(status);
CREATE INDEX IF NOT EXISTS idx_index_progress_started_at ON index_progress(started_at);

-- Direct links indexes
CREATE INDEX IF NOT EXISTS idx_direct_links_expires_at ON direct_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_direct_links_file_path ON direct_links(file_path);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Update statistics for query planner
ANALYZE;