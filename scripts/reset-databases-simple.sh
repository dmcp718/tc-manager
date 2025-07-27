#!/bin/bash

# Simple reset script for TeamCache Manager databases

set -euo pipefail

echo "🔄 Resetting TeamCache Manager databases..."
echo ""

# Clear PostgreSQL files table
echo "📊 Clearing PostgreSQL files table..."
docker compose exec postgres sh -c "PGPASSWORD=LBaUvHtDaxWeNv3i641uela7 psql -h localhost -U teamcache_user -d teamcache_db -c 'TRUNCATE TABLE files CASCADE;'"

# Clear other tables
docker compose exec postgres sh -c "PGPASSWORD=LBaUvHtDaxWeNv3i641uela7 psql -h localhost -U teamcache_user -d teamcache_db -c 'TRUNCATE TABLE cache_job_items, cache_jobs, indexing_sessions, index_progress CASCADE;'"

echo "✅ PostgreSQL cleared"
echo ""

# Clear Elasticsearch
echo "🔍 Clearing Elasticsearch..."
curl -X DELETE "http://localhost:9200/teamcache-files" 2>/dev/null || true
echo ""

# Recreate Elasticsearch index
curl -X PUT "http://localhost:9200/teamcache-files" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0
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
        "cached": { "type": "boolean" }
      }
    }
  }' 2>/dev/null

echo ""
echo "✅ Elasticsearch cleared and recreated"
echo ""

# Verify
FILE_COUNT=$(docker compose exec postgres sh -c "PGPASSWORD=LBaUvHtDaxWeNv3i641uela7 psql -h localhost -U teamcache_user -d teamcache_db -t -c 'SELECT COUNT(*) FROM files;'" | xargs)
ES_COUNT=$(curl -s "http://localhost:9200/teamcache-files/_count" | grep -o '"count":[0-9]*' | cut -d: -f2 || echo "0")

echo "📊 Database status:"
echo "  PostgreSQL files: $FILE_COUNT records"
echo "  Elasticsearch: $ES_COUNT documents"
echo ""
echo "✅ Done! Now run 'Index Files' from the UI to populate both databases."