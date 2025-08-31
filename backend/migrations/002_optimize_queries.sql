-- Query optimization views and functions
-- TeamCache Manager v1.8.0

-- Create materialized view for directory stats (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS directory_stats AS
SELECT 
    parent_path,
    COUNT(*) as total_files,
    COUNT(*) FILTER (WHERE is_directory = false) as file_count,
    COUNT(*) FILTER (WHERE is_directory = true) as dir_count,
    SUM(size) FILTER (WHERE is_directory = false) as total_size,
    COUNT(*) FILTER (WHERE is_cached = true AND is_directory = false) as cached_files,
    SUM(size) FILTER (WHERE is_cached = true AND is_directory = false) as cached_size,
    MAX(modified_time) as latest_modified
FROM files
GROUP BY parent_path;

CREATE UNIQUE INDEX IF NOT EXISTS idx_directory_stats_path ON directory_stats(parent_path);

-- Function to refresh directory stats
CREATE OR REPLACE FUNCTION refresh_directory_stats() RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY directory_stats;
END;
$$ LANGUAGE plpgsql;

-- Create function for efficient path queries
CREATE OR REPLACE FUNCTION get_path_contents(target_path text) 
RETURNS TABLE (
    path text,
    name text,
    size bigint,
    is_directory boolean,
    is_cached boolean,
    modified_time timestamp,
    indexed_at timestamp
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.path,
        f.name,
        f.size,
        f.is_directory,
        f.is_cached,
        f.modified_time,
        f.indexed_at
    FROM files f
    WHERE f.parent_path = target_path
    ORDER BY f.is_directory DESC, f.name ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add table partitioning preparation for large deployments
-- (commented out - enable if files table exceeds 10M rows)
-- CREATE TABLE files_2025 PARTITION OF files FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');