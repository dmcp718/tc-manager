-- File Caching System Database Schema
-- PostgreSQL database for file system indexing and cache management

-- Create database (run separately as superuser)
-- CREATE DATABASE sitecache_db;
-- \c sitecache_db;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Files table with hierarchical path structure
CREATE TABLE files (
    id BIGSERIAL PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    parent_path TEXT,
    is_directory BOOLEAN NOT NULL DEFAULT FALSE,
    size BIGINT DEFAULT 0,
    modified_at TIMESTAMP,
    permissions INTEGER,
    
    -- Caching metadata
    cached BOOLEAN DEFAULT FALSE,
    cached_at TIMESTAMP,
    cache_job_id UUID,
    
    -- Indexing metadata
    indexed_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_seen_session_id INTEGER,
    
    -- Additional metadata as JSON
    metadata JSONB DEFAULT '{}'
);

-- Job queue table for cache operations
CREATE TABLE cache_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'paused', 'cancelled')),
    file_paths TEXT[] NOT NULL,
    directory_paths TEXT[] DEFAULT '{}',
    total_files INTEGER NOT NULL,
    completed_files INTEGER DEFAULT 0,
    failed_files INTEGER DEFAULT 0,
    worker_id TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Individual job items for granular tracking
CREATE TABLE cache_job_items (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID REFERENCES cache_jobs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    worker_id TEXT
);

-- Indexing progress tracking
CREATE TABLE index_progress (
    id SERIAL PRIMARY KEY,
    root_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'stopped')),
    total_files INTEGER DEFAULT 0,
    processed_files INTEGER DEFAULT 0,
    current_path TEXT,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Indexing sessions for deletion tracking
CREATE TABLE indexing_sessions (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    root_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed'))
);

-- Indexes for performance
CREATE INDEX idx_files_path ON files USING btree(path);
CREATE INDEX idx_files_parent_path ON files USING btree(parent_path);
CREATE INDEX idx_files_name ON files USING btree(name);
CREATE INDEX idx_files_cached ON files USING btree(cached) WHERE cached = true;
CREATE INDEX idx_files_is_directory ON files USING btree(is_directory);
CREATE INDEX idx_files_path_search ON files USING gin(to_tsvector('english', path));
CREATE INDEX idx_files_updated_at ON files USING btree(updated_at);

CREATE INDEX idx_cache_jobs_status ON cache_jobs USING btree(status);
CREATE INDEX idx_cache_jobs_created_at ON cache_jobs USING btree(created_at);

CREATE INDEX idx_cache_job_items_job_id ON cache_job_items USING btree(job_id);
CREATE INDEX idx_cache_job_items_status ON cache_job_items USING btree(status);
CREATE INDEX idx_cache_job_items_file_path ON cache_job_items USING btree(file_path);

CREATE INDEX idx_index_progress_status ON index_progress USING btree(status);
CREATE INDEX idx_index_progress_root_path ON index_progress USING btree(root_path);

CREATE INDEX idx_indexing_sessions_status ON indexing_sessions USING btree(status);
CREATE INDEX idx_indexing_sessions_root_path ON indexing_sessions USING btree(root_path);
CREATE INDEX idx_files_last_seen_session_id ON files USING btree(last_seen_session_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_files_updated_at 
    BEFORE UPDATE ON files 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to get directory tree recursively
CREATE OR REPLACE FUNCTION get_directory_tree(root_path TEXT)
RETURNS TABLE(
    path TEXT,
    name TEXT,
    parent_path TEXT,
    is_directory BOOLEAN,
    size BIGINT,
    modified_at TIMESTAMP,
    cached BOOLEAN,
    level INTEGER
) AS $$
WITH RECURSIVE tree AS (
    -- Base case: start with root directory
    SELECT 
        f.path,
        f.name,
        f.parent_path,
        f.is_directory,
        f.size,
        f.modified_at,
        f.cached,
        0 as level
    FROM files f
    WHERE f.path = root_path
    
    UNION ALL
    
    -- Recursive case: get children
    SELECT 
        f.path,
        f.name,
        f.parent_path,
        f.is_directory,
        f.size,
        f.modified_at,
        f.cached,
        t.level + 1
    FROM files f
    INNER JOIN tree t ON f.parent_path = t.path
    WHERE t.level < 10 -- Prevent infinite recursion
)
SELECT * FROM tree ORDER BY level, name;
$$ LANGUAGE SQL;

-- Function to calculate directory size recursively
CREATE OR REPLACE FUNCTION get_directory_size(dir_path TEXT)
RETURNS TABLE(
    total_size NUMERIC,
    file_count BIGINT,
    directory_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE dir_tree AS (
        -- Get all files under this directory (including the directory itself)
        SELECT path, size, is_directory
        FROM files
        WHERE path = dir_path
        
        UNION ALL
        
        -- Recursively get all children
        SELECT f.path, f.size, f.is_directory
        FROM files f
        INNER JOIN dir_tree dt ON f.parent_path = dt.path
        WHERE dt.is_directory = true
    )
    SELECT 
        COALESCE(SUM(size) FILTER (WHERE is_directory = false), 0) as total_size,
        COUNT(*) FILTER (WHERE is_directory = false) as file_count,
        COUNT(*) FILTER (WHERE is_directory = true) - 1 as directory_count -- Subtract 1 for the root directory
    FROM dir_tree;
END;
$$ LANGUAGE plpgsql;

-- Function to get cache statistics
CREATE OR REPLACE FUNCTION get_cache_stats()
RETURNS TABLE(
    total_files BIGINT,
    cached_files BIGINT,
    cache_percentage NUMERIC,
    total_size BIGINT,
    cached_size BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_files,
        COUNT(*) FILTER (WHERE cached = true) as cached_files,
        ROUND(
            (COUNT(*) FILTER (WHERE cached = true) * 100.0) / NULLIF(COUNT(*), 0), 
            2
        ) as cache_percentage,
        COALESCE(SUM(size), 0) as total_size,
        COALESCE(SUM(size) FILTER (WHERE cached = true), 0) as cached_size
    FROM files 
    WHERE is_directory = false;
END;
$$ LANGUAGE plpgsql;

-- View for quick access to cached files
CREATE VIEW cached_files AS
SELECT 
    path,
    name,
    parent_path,
    size,
    modified_at,
    cached_at,
    cache_job_id
FROM files 
WHERE cached = true AND is_directory = false
ORDER BY cached_at DESC;

-- View for pending cache jobs
CREATE VIEW pending_cache_jobs AS
SELECT 
    j.id,
    j.status,
    j.total_files,
    j.completed_files,
    j.failed_files,
    j.created_at,
    j.started_at,
    ROUND(
        (j.completed_files * 100.0) / NULLIF(j.total_files, 0), 
        2
    ) as progress_percentage
FROM cache_jobs j
WHERE j.status IN ('pending', 'running')
ORDER BY j.created_at;

-- Initial data will be created by init-lucidlink-root.sql based on environment variables