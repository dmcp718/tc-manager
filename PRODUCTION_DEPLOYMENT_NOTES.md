# PRODUCTION_DEPLOYMENT_NOTES.md

## Elasticsearch Disk Space Issue

### Problem
Elasticsearch may fail with "all shards failed" error if the server disk usage exceeds 90% (high watermark). This prevents Elasticsearch from allocating shards.

### Symptoms
- Elasticsearch searches return: `{"error":"Failed to search files with Elasticsearch"}`
- Backend logs show: `search_phase_execution_exception` and `NoShardAvailableActionException`
- Index status shows RED in `curl http://localhost:9200/_cat/indices?v`

### Solution
1. **Check disk space**: `df -h`
2. **If disk usage > 90%**, either:
   - Free up disk space (recommended)
   - OR temporarily disable disk threshold:
   ```bash
   curl -X PUT "localhost:9200/_cluster/settings" -H 'Content-Type: application/json' -d'{
     "persistent": {
       "cluster.routing.allocation.disk.threshold_enabled": false
     }
   }'
   ```
3. **Force retry shard allocation**:
   ```bash
   curl -X POST "localhost:9200/_cluster/reroute?retry_failed=true" -H 'Content-Type: application/json'
   ```

### Prevention
- Monitor disk usage regularly
- Keep disk usage below 85% for production systems
- Consider adjusting Elasticsearch watermarks if needed

## Direct Link Port Detection

### Problem
Direct links fail with connection refused if the LucidLink REST API port is not correctly detected.

### Solution
The DirectLinkService now dynamically detects the port by parsing `lucid list` output in production environments. The service:
1. Runs `lucid --instance 2001 list`
2. Parses the output to find the PORT column
3. Falls back to environment variables or defaults if detection fails

### Default Ports
- Production: 20010 (fallback)
- Development: 9780 (fallback)
- Actual production port detected: 9779

## Database Reset Process

### Problem
When Elasticsearch gets out of sync with PostgreSQL or when you need a clean slate.

### Solution
Use the database reset script to clear both databases:

```bash
./scripts/reset-databases-simple.sh
```

This script will:
1. Clear all data from PostgreSQL files table
2. Delete and recreate the Elasticsearch index
3. Verify both databases are empty

After reset, run indexing from the UI or via API to repopulate both databases.

### Authentication
The default admin password is set in the environment as `ADMIN_PASSWORD`. For this deployment it's `SiteCaash@IBC25` (not the development default of `admin123`).