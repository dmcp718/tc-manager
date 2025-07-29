#!/bin/bash

# Reset both PostgreSQL and Elasticsearch databases to greenfield state

set -euo pipefail

echo "🔄 Resetting TeamCache Manager databases to greenfield state..."
echo "⚠️  WARNING: This will DELETE all data from both PostgreSQL and Elasticsearch!"
echo ""

# Get database credentials from environment
DB_PASSWORD="${POSTGRES_PASSWORD:-LBaUvHtDaxWeNv3i641uela7}"
DB_USER="${DB_USER:-teamcache_user}"
DB_NAME="${DB_NAME:-teamcache_db}"
ES_INDEX="${ELASTICSEARCH_INDEX:-teamcache-files}"

echo "📊 Clearing PostgreSQL database..."
# Clear all data from PostgreSQL tables (in correct order to respect foreign keys)
docker compose exec postgres sh -c "PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME" << EOF
-- Disable foreign key checks temporarily
BEGIN;

-- Clear all tables in dependency order
TRUNCATE TABLE cache_job_items CASCADE;
TRUNCATE TABLE cache_jobs CASCADE;
TRUNCATE TABLE files CASCADE;
TRUNCATE TABLE indexing_sessions CASCADE;
TRUNCATE TABLE index_progress CASCADE;
TRUNCATE TABLE job_profiles CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE remote_upload_activity CASCADE;
TRUNCATE TABLE cache_profiles CASCADE;
TRUNCATE TABLE directory_sizes CASCADE;

-- Reset sequences
ALTER SEQUENCE cache_jobs_id_seq RESTART WITH 1;
ALTER SEQUENCE files_id_seq RESTART WITH 1;
ALTER SEQUENCE indexing_sessions_id_seq RESTART WITH 1;
ALTER SEQUENCE index_progress_id_seq RESTART WITH 1;
ALTER SEQUENCE job_profiles_id_seq RESTART WITH 1;
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE remote_upload_activity_id_seq RESTART WITH 1;
ALTER SEQUENCE cache_profiles_id_seq RESTART WITH 1;

-- Re-insert default data
INSERT INTO users (username, password_hash, role) VALUES 
('admin', '\$2b\$10\$8Kx7pYPxOZ6TXtZZ0Z0Z0eZxZxZxZxZxZxZxZxZxZxZxZxZxZx', 'admin');

INSERT INTO job_profiles (name, description, file_patterns, priority, max_workers) VALUES
('small-files', 'Optimized for small files under 100MB', '["*.txt","*.md","*.json","*.xml","*.html","*.css","*.js"]', 5, 10),
('large-videos', 'Optimized for large video files', '["*.mp4","*.mov","*.avi","*.mkv","*.mxf"]', 3, 3),
('proxy-media', 'Proxy and preview files', '["*_proxy.*","*_preview.*","*.prproj","*.aep"]', 4, 5),
('documents', 'Office documents and PDFs', '["*.pdf","*.doc","*.docx","*.xls","*.xlsx","*.ppt","*.pptx"]', 4, 5),
('general', 'General purpose profile', '["*"]', 2, 5);

INSERT INTO cache_profiles (name, description, match_patterns, settings) VALUES
('video-production', 'Video production files', '{"extensions": [".mp4", ".mov", ".mxf", ".r3d"], "paths": ["*/Raw/*", "*/Footage/*"]}', '{"priority": 10, "retention_days": 30}'),
('project-files', 'Project and session files', '{"extensions": [".prproj", ".aep", ".drp", ".fcp"], "paths": ["*/Projects/*"]}', '{"priority": 8, "retention_days": 90}'),
('proxy-media', 'Proxy and preview files', '{"extensions": ["_proxy.mp4", "_preview.mp4"], "paths": ["*/Proxies/*", "*/Previews/*"]}', '{"priority": 6, "retention_days": 14}'),
('documents', 'Documents and images', '{"extensions": [".pdf", ".doc", ".jpg", ".png", ".psd"], "paths": ["*/Documents/*", "*/Images/*"]}', '{"priority": 4, "retention_days": 60}');

COMMIT;

SELECT 'PostgreSQL tables cleared and reset' as status;
EOF

echo "✅ PostgreSQL database cleared"
echo ""

echo "🔍 Clearing Elasticsearch index..."
# Delete and recreate the Elasticsearch index
curl -X DELETE "http://localhost:9200/$ES_INDEX" 2>/dev/null || true
echo ""

# Create fresh index with proper mappings
curl -X PUT "http://localhost:9200/$ES_INDEX" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index": {
        "refresh_interval": "1s"
      }
    },
    "mappings": {
      "properties": {
        "path": { "type": "keyword" },
        "name": { 
          "type": "text",
          "fields": {
            "keyword": { "type": "keyword" }
          }
        },
        "extension": { "type": "keyword" },
        "size": { "type": "long" },
        "is_directory": { "type": "boolean" },
        "modified_at": { "type": "date" },
        "cached": { "type": "boolean" },
        "cache_time": { "type": "long" },
        "parent_path": { "type": "keyword" },
        "depth": { "type": "integer" }
      }
    }
  }' 2>/dev/null

echo ""
echo "✅ Elasticsearch index recreated"
echo ""

# Verify the reset
echo "🔍 Verifying database reset..."
echo ""

# Check PostgreSQL
FILE_COUNT=$(docker compose exec postgres sh -c "PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME -t -c 'SELECT COUNT(*) FROM files;'" | xargs)
echo "PostgreSQL files table: $FILE_COUNT records"

# Check Elasticsearch
ES_COUNT=$(curl -s "http://localhost:9200/$ES_INDEX/_count" | grep -o '"count":[0-9]*' | cut -d: -f2 || echo "0")
echo "Elasticsearch index: $ES_COUNT documents"
echo ""

echo "✅ Databases reset to greenfield state!"
echo ""
echo "Next steps:"
echo "1. Run 'Index Files' from the TeamCache Manager UI to populate both databases"
echo "2. Or run: docker compose exec backend node /app/indexer.js"
echo ""