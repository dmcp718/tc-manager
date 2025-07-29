# PRODUCTION_DEPLOYMENT_NOTES.md

Last Updated: 2025-01-28

## Container Name Changes

### Important Update
All containers now use the `tc-mgr-` prefix for consistency:
- `tc-mgr-backend` (was sc-mgr-backend)
- `tc-mgr-frontend` (was sc-mgr-frontend)
- `tc-mgr-postgres` (was sc-mgr-postgres)
- `tc-mgr-redis` (was sc-mgr-redis)
- `tc-mgr-elasticsearch` (was sc-mgr-elasticsearch)
- `tc-mgr-varnish-stats` (was sc-mgr-varnish-stats)

Update any scripts or commands accordingly.

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

## Video Preview System

### Overview
The video preview system uses FFmpeg to transcode non-web-compatible video formats to DASH for streaming.

### Key Components
1. **MediaPreviewService**: Core preview generation logic
2. **VideoPreviewManager**: Manages worker pool for batch processing
3. **VideoPreviewWorker**: Individual worker for processing files
4. **Redis Cache**: Stores preview metadata and status

### Common Issues

#### FFmpeg False Errors
- **Problem**: FFmpeg may exit with code 1 even when files are successfully created
- **Solution**: The system now checks if manifest.mpd exists before considering it a failure

#### Preview Shows "Processing..." for Completed Files
- **Problem**: Redis entries may have status "completed" but also contain error fields
- **Solution**: Frontend now properly handles completed status regardless of error field

#### Video Preview Jobs Not Showing in UI
- **Problem**: mediaPreviewService not properly initialized in workers
- **Solution**: Ensure mediaPreviewService is passed to VideoPreviewManager constructor

### Configuration
```bash
# Video Preview Workers
VIDEO_PREVIEW_WORKER_COUNT=2      # Number of preview workers
VIDEO_PREVIEW_MAX_CONCURRENT=2    # Max concurrent previews per worker
VIDEO_PREVIEW_POLL_INTERVAL=5000  # Worker poll interval (ms)

# Video Transcoding Settings
TRANSCODE_VIDEO_BITRATE=1000k     # Video bitrate
TRANSCODE_VIDEO_WIDTH=1280        # Output width
TRANSCODE_VIDEO_HEIGHT=720        # Output height
```

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

## Production Deployment Process

### Standard Deployment (nginx SSL - Default)
```bash
# 1. Generate production environment
./scripts/generate-production-env.sh

# 2. Deploy with nginx SSL (default for IP addresses)
./scripts/deploy-production.sh
# or explicitly:
./scripts/deploy-production.sh nginx
```

### Alternative: Caddy Deployment (Domain Names)
```bash
./scripts/deploy-production.sh caddy
```

### Clean Production Deployment
```bash
# For a completely fresh deployment
./scripts/clean-deploy-test.sh
./scripts/generate-production-env.sh
./scripts/deploy-production.sh
```

## SSL Configuration

### nginx (Default for IP Addresses)
- Self-signed certificates work with IP addresses
- Certificates placed in `./ssl/` directory
- Configuration in `docker-compose.ssl.yml`

### Caddy (For Domain Names)
- Automatic HTTPS with Let's Encrypt
- Requires valid domain name
- Configuration in `docker-compose.caddy.yml`

## Terminal WebSocket Configuration

For Admin Terminal to work with nginx SSL:

1. **nginx.ssl.conf** includes proper WebSocket proxy configuration:
```nginx
location /terminal {
    proxy_pass http://backend:3002/terminal;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

2. **Frontend** connects to WebSocket via the proxied path

## Authentication Notes

### Default Credentials
- Username: `admin`
- Password: Set via `ADMIN_PASSWORD` environment variable
- JWT Secret: Must be generated for production (not the development default)

### Environment Generation
The `generate-production-env.sh` script will:
1. Prompt for all required values
2. Generate secure passwords automatically
3. Create a complete `.env` file
4. Set proper SERVER_HOST for frontend URLs

## Critical Environment Variables

### Required for Production
```bash
SERVER_HOST=your-server-ip-or-domain.com  # CRITICAL for frontend URLs
POSTGRES_PASSWORD=<secure-password>
JWT_SECRET=<secure-jwt-secret>
ADMIN_PASSWORD=<secure-admin-password>
LUCIDLINK_FILESPACE=<your-filespace>
LUCIDLINK_USER=<your-email>
LUCIDLINK_PASSWORD=<your-password>
```

### Performance Tuning
```bash
CACHE_WORKER_COUNT=4              # Increase for more parallelism
MAX_CONCURRENT_FILES=5            # Adjust based on file sizes
NODE_OPTIONS=--max-old-space-size=3072  # Memory for Node.js
VIDEO_PREVIEW_WORKER_COUNT=2      # Video transcoding workers
```

## Troubleshooting Commands

### Check Service Health
```bash
# Overall health
curl http://localhost:3001/health

# Service status
docker compose ps

# Container logs
docker compose logs -f backend
docker compose logs -f frontend

# Video preview status
curl http://localhost:3001/api/video-preview/status
```

### Common Fixes
```bash
# Restart backend after configuration changes
docker compose restart backend

# Rebuild with new code changes
docker compose build --no-cache backend
docker compose up -d

# Clear preview cache
docker exec tc-mgr-backend rm -rf /app/preview-cache/*

# Check LucidLink mount
docker exec tc-mgr-backend ls -la /media/lucidlink-1
```

## Notes
- Always use `tc-mgr-` prefix for container names in commands
- nginx is now the default SSL mode for IP-based deployments
- Video preview system requires FFmpeg (included in container)
- Redis is used for preview metadata caching
- DASH streaming is used for non-web-compatible video formats