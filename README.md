# TeamCache Manager

A filespace browser and cache management system for LucidLink cloud filesystems with advanced search capabilities, intelligent caching, media preview generation, real-time data verification, and Docker deployment.

## 🚀 Key Features

### 📁 File System Management
- **LucidLink Integration**: Native integration with LucidLink API for cloud filesystem operations
- **Interactive File Browser**: Real-time tree navigation with WebSocket updates
- **Direct Link Generation**: Secure download links for files and directories
- **Smart Indexing**: Efficient PostgreSQL-based file metadata indexing with automatic cleanup
- **Real-time Verification**: Filesystem existence checks ensure sidebar-level accuracy

### 🎬 Media Preview & Transcoding
- **Video Preview Generation**: Automatic DASH transcoding for non-web formats
- **Batch Processing**: Queue-based video preview generation with worker pools
- **Smart Caching**: Redis-cached preview metadata with filesystem persistence
- **Format Support**: Handles professional formats (ProRes, R3D, BRAW, etc.)
- **Progressive Streaming**: DASH adaptive bitrate streaming

### 🔍 Advanced Search & Indexing
- **Dual Search Engines**: PostgreSQL for reliability + Elasticsearch for performance
- **Real-time Verification**: Search results verified against filesystem for accuracy
- **Automatic Indexing**: Background file system scanning with change detection
- **Stale Data Cleanup**: Self-healing system removes outdated entries automatically
- **Boolean Search**: Support for wildcards, operators, and complex queries
- **Unified Jobs Panel**: Track indexing, caching, and script execution in one interface

### ⚡ Intelligent Cache Management  
- **Job Profiles**: Automatic optimization based on file types and sizes
- **Parallel Workers**: Configurable concurrent cache operations
- **Real-time Monitoring**: Live progress tracking via WebSocket
- **Queue Management**: Priority-based job scheduling with failure recovery

### 📊 Monitoring & Analytics
- **Varnish Cache Stats**: Real-time cache usage and efficiency metrics
- **Network Statistics**: LucidLink download speed monitoring  
- **Health Checks**: Comprehensive system status monitoring
- **Structured Logging**: JSON logging with rotation and level controls

### 👨‍💼 Admin Dashboard (NEW)
- **System Status**: Real-time monitoring of server resources and services
- **User Management**: Create, edit, and manage user accounts with role-based access
- **Terminal Access**: Secure web-based terminal for system administration
- **Application Logs**: View and search through application logs in real-time
- **Service Monitoring**: Track SiteCache jobs, indexing status, and worker health

### 🔌 API Gateway (Optional)
- **External API**: REST API for submitting cache jobs from external services
- **Simple Authentication**: API key-based authentication for dev/demo use
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Job Management**: Create, monitor, and cancel cache jobs via API

### 🔒 Production Security
- **Authentication**: JWT-based authentication with user management
- **Role-Based Access**: Admin and user roles with different permission levels
- **Container Security**: Non-root users, read-only filesystems, AppArmor profiles
- **FUSE Integration**: Secure filesystem mounting with proper permissions
- **Environment Configuration**: Secure credential management
- **Network Isolation**: Proper container networking and access controls

## 🏗️ Architecture Overview

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│   Frontend      │    Backend      │    Database     │   Search Index  │
│                 │                 │                 │                 │
│  React SPA      │  Node.js API    │  PostgreSQL 15  │ Elasticsearch 8 │
│  WebSocket      │  Express.js     │  File Metadata  │  Search Engine  │
│  Search UI      │  Index Workers  │  Job Queue      │  Full-text      │
│  (Port 8080)    │  (Port 3001)    │  (Port 5432)    │  (Port 9200)    │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
         │                 │                 │                 │
         └─────────────────┼─────────────────┼─────────────────┘
                          │                 │
                  ┌───────┴─────────────────┴──────┐
                  │        Redis Cache             │
                  │    Preview Metadata            │
                  │     Session Storage            │
                  │       (Port 6379)              │
                  └───────┬─────────────────┬──────┘
         │                 │                 │                 │
         └─────────────────┼─────────────────┼─────────────────┘
                          │                 │
                  ┌───────┴─────────────────┴──────┐
                  │      Data Synchronization      │
                  │   Real-time Verification       │
                  │   Stale Entry Cleanup          │
                  └───────┬─────────────────┬──────┘
                          │                 │
    ┌─────────────────────┼─────────────────┼─────────────────────┐
    │                Docker Network                              │
    │                                                            │
    │  ┌─────────────────┐  ┌─────────────────┐ ┌─────────────────┐ │
    │  │  LucidLink API  │  │ Varnish Cache   │ │   Grafana       │ │
    │  │  (Port 7778)    │  │ Stats Collector │ │  Monitoring     │ │
    │  └─────────────────┘  └─────────────────┘ └─────────────────┘ │
    └────────────────────────────────────────────────────────────────┘
```

## 📋 Prerequisites

### System Requirements
- **Operating System**: Ubuntu 20.04+ (production) or macOS/Windows with Docker Desktop
- **Docker**: Docker Engine 20.10+ with Docker Compose plugin
- **Memory**: Minimum 8GB RAM (16GB recommended for production)
- **Storage**: 10GB+ free space for database and logs
- **Network**: Internet access for LucidLink cloud connectivity

### Required Services
- **LucidLink Client**: Must be installed and configured on the host system
- **PostgreSQL**: Provided via Docker container for metadata and job management
- **Elasticsearch**: Provided via Docker container for high-performance search
- **Varnish Cache** (optional): For cache statistics integration
- **Grafana** (optional): For advanced monitoring and dashboards

## 🚀 Quick Start

### 1. Clone and Initial Setup

```bash
git clone https://github.com/dmcp718/tc-manager.git
cd teamcache-manager

# For a fresh setup (recommended for first time)
./scripts/setup-development.sh

# For a completely clean setup (removes all Docker resources)
./scripts/setup-development.sh --clean
```

The setup script will:
- Create required directories
- Generate host system information file
- Create .env from template
- Set up development overrides file
- Provide SSH setup instructions for terminal feature
- Optional: Clean existing Docker resources with `--clean` flag

### 2. Configure Environment

Edit the `.env` file with your specific configuration:

```bash
# REQUIRED: Set your server IP or domain
SERVER_HOST=your-server-ip-or-localhost

# REQUIRED: Add your LucidLink credentials
LUCIDLINK_FILESPACE=your_filespace_name
LUCIDLINK_USER=your_email@example.com
LUCIDLINK_PASSWORD=your_password

# OPTIONAL: Change default passwords (recommended)
POSTGRES_PASSWORD=your_secure_password
ADMIN_PASSWORD=your_admin_password
```

**Important Environment Notes:**
- `SERVER_HOST`: Set to `localhost` for local development or your server's IP/domain for remote access
- Frontend URLs are automatically constructed using SERVER_HOST
- For production, use strong passwords and generate a secure JWT_SECRET
- See `.env.example` for all available configuration options

**Development vs Production:**
- **Development**: Uses port 3010 for frontend with hot reload and volume mounts
- **Production**: Uses port 8080 for frontend with optimized builds

### 2. Install LucidLink Binary (Required)

The LucidLink client binary is required but not included in the repository due to file size limits. Download and place it manually:

```bash
# Create the required directory (in parent directory due to Docker build context)
mkdir -p ../lucidlink-builds

# Or if you have the file locally, copy it to the correct directory:
cp /path/to/lucidlink_3.2.6817_amd64.deb ../lucidlink-builds/
```

**Important**: Due to the Docker build context configuration, place the file in `../lucidlink-builds/` (parent directory of the cloned repository). The Dockerfile will find it there during the build process.

### 3. Configure Environment

The repository includes pre-configured environment files for different deployment scenarios:

- **`.env.development`**: Development settings with host.docker.internal for LucidLink API
- **`.env.production`**: Production settings with containerized LucidLink daemon

Edit your copied `.env` file with your LucidLink credentials:

```bash
# Required LucidLink Configuration
LUCIDLINK_FILESPACE=your-filespace.domain
LUCIDLINK_USER=your-email@domain.com
LUCIDLINK_PASSWORD=your-secure-password
LUCIDLINK_MOUNT_POINT=/media/lucidlink-1

# Authentication Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRY=8h
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# Database Security
POSTGRES_PASSWORD=your-strong-database-password

# Network Configuration (Development)
REACT_APP_API_URL=http://YOUR_DOCKER_HOST_IP:3001/api
REACT_APP_WS_URL=ws://YOUR_DOCKER_HOST_IP:3002
```

### 3. Start Development Environment

```bash
# Start development environment with hot reload
npm run dev

# Or start production environment
npm run prod:build
# This is equivalent to:
# docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build

# Verify deployment
docker compose ps
docker compose logs backend | head -20
```

### 4. Access Application

**Production Access:**
- **Frontend (HTTP)**: http://localhost:8080 or http://YOUR_HOST_IP:8080
- **Frontend (HTTPS)**: https://localhost:443 or https://YOUR_HOST_IP:443 (if SSL enabled)
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **WebSocket**: ws://localhost:3002

**Development Access:**
- **Frontend**: http://localhost:3010 (development with hot reload)

**Default Login Credentials:**
- Username: `admin`
- Password: `admin123`

## 🏭 Production Deployment

### Prerequisites Checklist

#### System Setup
- [ ] Ubuntu 20.04+ server with root access
- [ ] Docker and Docker Compose installed
- [ ] LucidLink client installed and configured
- [ ] Firewall configured (ports 8080, 3001, 3002, 5432)
- [ ] SSL certificates (optional but recommended)

#### LucidLink Configuration
LucidLink is automatically installed and configured within the Docker container. No manual installation required on the host system. The container includes:
- LucidLink client binary (`lucidlink_3.2.6817_amd64.deb`)
- FUSE filesystem support
- Automatic daemon startup with provided credentials

### 1. Environment Configuration

Create production environment file:

```bash
# Use the production deployment script
./scripts/generate-production-env.sh

# Or manually:
cp .env.production .env

# Edit with your specific production values
nano .env
```

**Critical Production Settings:**

```bash
# REQUIRED: Server identification
SERVER_HOST=your-server-ip-or-domain.com  # Critical for frontend URLs

# Authentication Security
JWT_SECRET=GENERATE_SECURE_JWT_SECRET_HERE
JWT_EXPIRY=8h
ADMIN_USERNAME=admin
ADMIN_PASSWORD=GENERATE_STRONG_ADMIN_PASSWORD_HERE

# Database Security
POSTGRES_PASSWORD=GENERATE_STRONG_PASSWORD_HERE
DB_HOST=postgres
DB_NAME=sitecache_db
DB_USER=sitecache_user

# LucidLink Integration
LUCIDLINK_FILESPACE=production.yourfilespace.com
LUCIDLINK_USER=production@yourdomain.com
LUCIDLINK_PASSWORD=SECURE_PRODUCTION_PASSWORD
LUCIDLINK_MOUNT_POINT=/media/lucidlink-1

# Network Configuration (Production)
REACT_APP_API_URL=https://your-domain.com/api
REACT_APP_WS_URL=wss://your-domain.com/ws

# Performance Tuning
CACHE_WORKER_COUNT=4
MAX_CONCURRENT_FILES=5
NODE_OPTIONS=--max-old-space-size=3072

# Video Preview Configuration
VIDEO_PREVIEW_WORKER_COUNT=2
VIDEO_PREVIEW_MAX_CONCURRENT=2
TRANSCODE_VIDEO_BITRATE=1000k
TRANSCODE_VIDEO_WIDTH=1280
TRANSCODE_VIDEO_HEIGHT=720
PREVIEW_CACHE_DIR=/app/preview-cache
PREVIEW_CACHE_HOST_PATH=./data/previews

# Security
NODE_ENV=production
SSL_CERT_PATH=/etc/ssl/certs/your-cert.pem
SSL_KEY_PATH=/etc/ssl/private/your-key.pem

# Varnish Integration (Optional)
ENABLE_VARNISH_STATS=true
VARNISH_CONTAINER_NAME=sitecache-varnish-1
VARNISH_STATS_INTERVAL=60000
```

### 2. SSL Certificate Setup (Automatic with nginx deployment)

**🔐 SSL certificates are generated automatically** when using nginx deployment:

```bash
# Deploy with nginx SSL (recommended) - certificates auto-generated if needed
./scripts/deploy-production.sh nginx

# Deploy with Caddy auto-SSL (for domain names)
./scripts/deploy-production.sh caddy

# Deploy without SSL (development only)
./scripts/deploy-production.sh none
```

The nginx deployment automatically:
- Checks for existing SSL certificates in `./ssl/`
- **Generates self-signed certificates if none exist**
- Uses existing certificates if already present

#### Manual Certificate Generation (Optional)

Only needed if you want to generate certificates separately or use custom certificates:

```bash
# Generate SSL certificates manually with auto-detected host IP
./scripts/generate-ssl-cert.sh

# Or specify host IP manually
SSL_HOST_IP=192.168.1.100 ./scripts/generate-ssl-cert.sh
```

To use custom CA-signed certificates:
1. Place your certificates in `./ssl/`:
   - Certificate: `./ssl/sc-mgr.crt`
   - Private key: `./ssl/sc-mgr.key`
2. Run deployment: `./scripts/deploy-production.sh nginx`

**Install certificate in browsers to avoid security warnings:**
```bash
# Follow browser installation instructions
./ssl/install-cert.sh
```

**SSL Certificate Types:**
- **Self-signed certificates**: Auto-generated or manually created (works with IP addresses)
- **Let's Encrypt certificates**: Use Caddy deployment for automatic Let's Encrypt
- **Commercial CA certificates**: Place in `./ssl/` directory before deployment

### 3. Deploy Production Stack

```bash
# Deploy without SSL (HTTP only)
./scripts/deploy-production.sh none

# Deploy with nginx SSL (default for IP addresses)
./scripts/deploy-production.sh
# or explicitly:
./scripts/deploy-production.sh nginx

# Alternative: Deploy with Caddy (for domain names with auto-HTTPS)
./scripts/deploy-production.sh caddy

# Verify all services are healthy
docker compose ps
docker compose logs backend | grep "Starting"
```

### 4. Production Verification

```bash
# Check service health
curl http://localhost:3001/health

# Verify LucidLink mounting
docker compose exec backend ls -la /media/lucidlink-1

# Check database connectivity
docker compose exec postgres psql -U sitecache_user -d sitecache_db -c "\dt"

# Verify WebSocket connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3002/
```

## 🔧 Detailed Configuration

### Environment Variables Reference

#### Authentication Configuration
```bash
JWT_SECRET=your_secure_jwt_secret         # JWT token signing secret
JWT_EXPIRY=8h                            # Token expiration time
ADMIN_USERNAME=admin                     # Admin username
ADMIN_PASSWORD=your_secure_password      # Admin password
```

#### Database Configuration
```bash
POSTGRES_PASSWORD=your_secure_password     # PostgreSQL database password
DB_HOST=postgres                          # Database hostname (container name)
DB_PORT=5432                             # PostgreSQL port
DB_NAME=sitecache_db                     # Database name
DB_USER=sitecache_user                   # Application database user
```

#### LucidLink Integration
```bash
LUCIDLINK_FILESPACE=filespace.domain     # Your LucidLink filespace
LUCIDLINK_USER=user@domain.com           # LucidLink account email
LUCIDLINK_PASSWORD=secure_password       # LucidLink account password
LUCIDLINK_MOUNT_POINT=/media/lucidlink-1 # Filesystem mount point
LUCIDLINK_COMMAND=/usr/local/bin/lucid   # LucidLink binary path
LUCIDLINK_API_HOST=host.docker.internal  # LucidLink API access
LUCIDLINK_FS_1_PORT=7778                 # LucidLink API port
```

#### Search & Indexing Configuration
```bash
# Elasticsearch Settings
ELASTICSEARCH_HOST=elasticsearch          # Elasticsearch hostname (container name)
ELASTICSEARCH_PORT=9200                  # Elasticsearch HTTP port
ELASTICSEARCH_INDEX=sitecache-files      # Search index name
ELASTICSEARCH_SYNC_DELETIONS=true        # Auto-sync deletions between PG and ES

# Indexing Settings
INDEX_ROOT_PATH=/media/lucidlink-1       # Root path for file indexing
ALLOWED_PATHS=/media/lucidlink-1         # Paths allowed for indexing (security)
```

#### Performance Tuning
```bash
CACHE_WORKER_COUNT=4                     # Number of parallel cache workers
MAX_CONCURRENT_FILES=5                   # Max files per worker
WORKER_POLL_INTERVAL=2000               # Worker polling interval (ms)
UV_THREADPOOL_SIZE=16                   # Node.js thread pool size
NODE_OPTIONS=--max-old-space-size=3072  # Node.js memory limit (MB)
```

#### Network Configuration
```bash
PORT=3001                               # Backend API port
WEBSOCKET_PORT=3002                     # WebSocket server port
NETWORK_INTERFACE=eth0                  # Network interface for monitoring
REACT_APP_API_URL=http://host:3001/api # Frontend API endpoint
REACT_APP_WS_URL=ws://host:3002        # Frontend WebSocket endpoint
REACT_APP_GRAFANA_URL=http://host:3000 # Grafana dashboard URL
```

#### Security Settings
```bash
NODE_ENV=production                     # Production mode
SSL_CERT_PATH=/path/to/cert.pem        # SSL certificate path
SSL_KEY_PATH=/path/to/key.pem          # SSL private key path
DOMAIN_NAME=YOUR_SERVER_IP             # Domain/IP for SSL (can be IP for self-signed certs)
```

#### Varnish Integration (Optional)
```bash
ENABLE_VARNISH_STATS=true              # Enable Varnish statistics
VARNISH_CONTAINER_NAME=varnish-1       # Varnish container name
VARNISH_STATS_INTERVAL=60000          # Stats update interval (ms)
```

#### Remote Upload Indicator (RUI)
```bash
# RUI tracks files being uploaded across the LucidLink filesystem
# Three operation modes available:
# 1. Disabled: ENABLE_RUI=false
# 2. Database only: ENABLE_RUI=true, ENABLE_RUI_FILESYSTEM_SCANNER=false
# 3. Full scanning: ENABLE_RUI=true, ENABLE_RUI_FILESYSTEM_SCANNER=true

ENABLE_RUI=true                        # Master switch for RUI feature
ENABLE_RUI_FILESYSTEM_SCANNER=true     # Enable filesystem scanning
RUI_SCAN_INTERVAL=30000               # Upload scan interval (ms)
RUI_MONITOR_INTERVAL=2000             # Progress check interval (ms)
RUI_BATCH_SIZE=100                    # Files per batch
RUI_MAX_CONCURRENT_MONITORS=10        # Max concurrent monitors
```

### Docker Compose Configuration

The system supports multiple deployment configurations:

#### Development Environment
- **Files**: `docker-compose.yml` + `docker-compose.dev.yml`
- **Command**: `npm run dev` or `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`
- **Features**: Hot reload, volume mounts, development ports
- **Frontend Port**: 3010 (avoids conflict with Grafana on port 3000)
- **Container Names**: sc-mgr-backend-dev, sc-mgr-frontend-dev
- **Debugging**: Node.js debugger available on port 9229

#### Production Environment  
- **Files**: `docker-compose.yml` + `docker-compose.prod.yml`
- **Command**: `npm run prod:build` or `docker compose -f docker-compose.yml -f docker-compose.prod.yml up`
- **Features**: Optimized builds, resource limits, health checks
- **Frontend Port**: 8080
- **Container Names**: sc-mgr-backend-prod, sc-mgr-frontend-prod

#### Production Optimizations
- **Performance**: Increased memory limits and CPU allocation
- **Security**: Non-root users, read-only filesystems
- **Monitoring**: Enhanced health checks and logging
- **Networking**: Optimized container communication

### Database Schema

#### Core Tables

**files**: File system metadata and hierarchy
```sql
id          BIGSERIAL PRIMARY KEY
path        TEXT UNIQUE NOT NULL     -- Full file path
name        TEXT NOT NULL            -- File/directory name  
parent_path TEXT                     -- Parent directory path
is_directory BOOLEAN DEFAULT FALSE   -- Directory flag
size        BIGINT DEFAULT 0         -- File size in bytes
modified_at TIMESTAMP                -- Last modification time
cached      BOOLEAN DEFAULT FALSE    -- Cache status
cached_at   TIMESTAMP                -- Cache timestamp
metadata    JSONB DEFAULT '{}'       -- Additional metadata
```

**cache_jobs**: Cache operation job queue
```sql
id              UUID PRIMARY KEY     -- Job identifier
status          TEXT NOT NULL        -- Job status (pending/running/completed/failed)
file_paths      TEXT[]              -- Files to cache
total_files     INTEGER             -- Total file count
completed_files INTEGER DEFAULT 0   -- Completed file count
failed_files    INTEGER DEFAULT 0   -- Failed file count
worker_id       TEXT                -- Assigned worker ID
created_at      TIMESTAMP           -- Job creation time
started_at      TIMESTAMP           -- Job start time
completed_at    TIMESTAMP           -- Job completion time
```

**cache_job_items**: Individual file cache tracking
```sql
id         BIGSERIAL PRIMARY KEY    -- Item identifier
job_id     UUID NOT NULL           -- Parent job reference
file_path  TEXT NOT NULL           -- File being cached
status     TEXT NOT NULL           -- Item status
worker_id  TEXT                    -- Processing worker
started_at TIMESTAMP               -- Item start time
completed_at TIMESTAMP             -- Item completion time
file_size  BIGINT                  -- File size in bytes
```

**index_progress**: File indexing operation tracking
```sql
id              BIGSERIAL PRIMARY KEY  -- Progress entry identifier
root_path       TEXT NOT NULL          -- Root path being indexed
status          TEXT NOT NULL          -- Status (pending/running/completed/failed)
total_files     INTEGER                -- Total files discovered
processed_files INTEGER DEFAULT 0      -- Files processed so far
current_path    TEXT                   -- Currently processing path
error_message   TEXT                   -- Error details if failed
started_at      TIMESTAMP DEFAULT NOW() -- Indexing start time
completed_at    TIMESTAMP              -- Indexing completion time
```

**indexing_sessions**: Session tracking for deletion detection
```sql
id           BIGSERIAL PRIMARY KEY     -- Session identifier
root_path    TEXT NOT NULL            -- Root path for session
status       TEXT NOT NULL            -- Session status
created_at   TIMESTAMP DEFAULT NOW()  -- Session creation time
completed_at TIMESTAMP                -- Session completion time
```

### Job Profiles

Automatic performance optimization based on file characteristics:

#### small-files
- **Criteria**: Files < 10MB
- **Configuration**: 30 concurrent files, 2 workers
- **Use Case**: Documents, configuration files, small images

#### large-videos  
- **Criteria**: Video files > 100MB
- **Configuration**: 3 concurrent files, 1 worker
- **Use Case**: Video editing, media production

#### proxy-media
- **Criteria**: Images/videos < 50MB
- **Configuration**: 20 concurrent files, 2 workers
- **Use Case**: Web assets, thumbnails, preview media

#### documents
- **Criteria**: Office files < 10MB
- **Configuration**: 10 concurrent files, 1 worker
- **Use Case**: Documents, spreadsheets, presentations

#### general
- **Criteria**: All other files
- **Configuration**: Balanced settings
- **Use Case**: Mixed file types, general purpose

## 🔒 Security Configuration

### Container Security

#### LucidLink FUSE Requirements
The backend container requires special privileges for FUSE filesystem mounting:

```yaml
backend:
  cap_add:
    - SYS_ADMIN                    # Required for FUSE operations
  devices:
    - "/dev/fuse"                  # FUSE device access
  security_opt:
    - "apparmor:unconfined"        # Relaxed AppArmor for FUSE
```

#### Security Best Practices
- **Credentials**: Store sensitive data in environment variables
- **Network**: Use Docker networks for inter-service communication
- **Filesystem**: Mount only required directories
- **Users**: Run services as non-root where possible
- **Updates**: Keep base images and dependencies updated

### FUSE Configuration

LucidLink requires FUSE filesystem support:

```bash
# Enable user_allow_other in container
echo "user_allow_other" >> /etc/fuse.conf

# Start LucidLink daemon with proper permissions
lucid daemon \
  --fs "$LUCIDLINK_FILESPACE" \
  --user "$LUCIDLINK_USER" \
  --password "$LUCIDLINK_PASSWORD" \
  --mount-point "$LUCIDLINK_MOUNT_POINT" \
  --fuse-allow-other
```

### Network Security

#### Container Networking
```yaml
networks:
  default:
    name: sc-mgr-network
```

#### Port Security
- **3001**: Backend API (HTTP)
- **3002**: WebSocket server (WS)
- **3010**: Frontend development server (HTTP) - development only
- **5432**: PostgreSQL database (internal only)
- **6379**: Redis cache (internal only)
- **8080**: Frontend web server (HTTP/HTTPS) - production
- **9200**: Elasticsearch HTTP API (internal only)
- **9229**: Node.js debugger port - development only
- **9300**: Elasticsearch cluster communication (internal only)

## 🔧 Troubleshooting

### Common Issues

#### LucidLink Connection Problems

**Symptom**: "LucidLink mount may have failed"
```bash
# Check LucidLink status
docker compose exec backend lucid status

# Verify mount point
docker compose exec backend mountpoint /media/lucidlink-1

# Check LucidLink logs
docker compose logs backend | grep -i lucidlink
```

**Solutions**:
1. Verify credentials in `.env` file
2. Check LucidLink service on host: `systemctl status lucidlink`
3. Ensure FUSE modules loaded: `lsmod | grep fuse`
4. Verify network connectivity to LucidLink API

#### Database Connection Issues

**Symptom**: "Database connection failed"
```bash
# Check PostgreSQL status
docker compose exec postgres pg_isready -U sitecache_user -d sitecache_db

# Verify database exists
docker compose exec postgres psql -U sitecache_user -d sitecache_db -c "\l"

# Check logs
docker compose logs postgres
```

**Solutions**:
1. Verify `POSTGRES_PASSWORD` matches in all services
2. Ensure PostgreSQL container is healthy: `docker compose ps`
3. Check database initialization logs for schema errors
4. Restart PostgreSQL service: `docker compose restart postgres`

#### WebSocket Connection Problems

**Symptom**: "WebSocket connection failed"
```bash
# Test WebSocket connectivity
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3002/

# Check backend WebSocket server
docker compose logs backend | grep WebSocket
```

**Solutions**:
1. Verify `REACT_APP_WS_URL` points to correct endpoint
2. Check firewall allows WebSocket connections
3. Ensure backend WebSocket server started: grep "WebSocket server" logs
4. Validate network connectivity between frontend and backend

#### Cache Job Failures

**Symptom**: Jobs stuck in "running" status
```bash
# Check cache worker status
curl http://localhost:3001/api/workers/status

# Review cache job logs
docker compose logs backend | grep -i cache

# Check individual job details
curl http://localhost:3001/api/jobs/{job-id}
```

**Solutions**:
1. Verify LucidLink filesystem is accessible
2. Check file permissions on target files
3. Monitor system resources (memory, CPU, disk)
4. Restart cache workers: restart backend service

#### Elasticsearch Search Issues

**Symptom**: "Elasticsearch is unavailable" or search errors
```bash
# Check Elasticsearch status
curl http://localhost:9200/_cluster/health

# Verify Elasticsearch container
docker compose logs elasticsearch

# Test search availability
curl http://localhost:3001/api/search/elasticsearch/availability
```

**Solutions**:
1. Ensure Elasticsearch container is running: `docker compose ps elasticsearch`
2. Check Elasticsearch memory settings: verify `ES_JAVA_OPTS=-Xms2g -Xmx2g`
3. Verify index exists: `curl http://localhost:9200/sitecache-files/_mapping`
4. Restart Elasticsearch: `docker compose restart elasticsearch`

#### Indexing Performance Issues

**Symptom**: Slow indexing or high memory usage
```bash
# Monitor indexing progress
curl http://localhost:3001/api/index/status

# Check indexing logs
docker compose logs backend | grep -i index

# Monitor system resources
docker stats
```

**Solutions**:
1. Reduce concurrent indexing: decrease `CACHE_WORKER_COUNT` in .env
2. Increase memory limits in docker-compose.yml
3. Check filesystem performance: run `iostat -x 1`
4. Consider indexing smaller directory subsets

#### Search Result Verification Issues

**Symptom**: Search results show "stale" or missing files
```bash
# Check verification statistics
curl http://localhost:3001/api/search?q=test | jq '.verification'

# Manual cleanup of stale Elasticsearch entries
curl -X POST http://localhost:3001/api/index/cleanup-elasticsearch
```

**Solutions**:
1. Re-run indexing to update database: use "Index Files" button
2. Clean stale Elasticsearch entries: manual cleanup endpoint
3. Verify filesystem connectivity: check LucidLink mount status
4. Check synchronization settings: `ELASTICSEARCH_SYNC_DELETIONS=true`

#### Frontend Loading Issues

**Symptom**: Frontend shows blank page or loading indefinitely
```bash
# Check frontend container status
docker compose logs frontend

# Verify frontend build
docker compose exec frontend ls -la /usr/share/nginx/html

# Test API connectivity
curl http://localhost:3001/health
```

**Solutions**:
1. Verify `REACT_APP_API_URL` and `REACT_APP_WS_URL` are correct
2. Rebuild frontend with correct environment: `docker compose build --no-cache frontend`
3. Check network connectivity between frontend and backend
4. Verify API endpoints are responding correctly

### Performance Optimization

#### Database Performance
```sql
-- Monitor query performance
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE tablename = 'files';
```

#### Cache Worker Tuning
```bash
# Monitor worker performance
curl http://localhost:3001/api/workers/status | jq

# Adjust worker configuration in .env
CACHE_WORKER_COUNT=8           # Increase for more parallelism
MAX_CONCURRENT_FILES=3         # Decrease for large files
WORKER_POLL_INTERVAL=1000     # Decrease for faster polling
```

#### System Resource Monitoring
```bash
# Monitor container resources
docker stats

# Check system memory and CPU
htop

# Monitor disk I/O
iotop

# Check network usage
iftop
```

#### Search and Indexing Performance

**Elasticsearch Optimization**
```bash
# Monitor Elasticsearch performance
curl http://localhost:9200/_cluster/stats

# Check index size and document count
curl http://localhost:9200/sitecache-files/_stats

# Monitor search performance
curl "http://localhost:9200/sitecache-files/_search?q=test&explain=true"
```

**Indexing Performance Tuning**
```bash
# Environment variables for indexing optimization
CACHE_WORKER_COUNT=4              # Increase for more parallel processing
ELASTICSEARCH_SYNC_DELETIONS=true # Keep ES and PostgreSQL synchronized
INDEX_ROOT_PATH=/media/lucidlink-1 # Ensure correct root path

# Monitor indexing memory usage
docker stats sc-mgr-backend-prod

# Check indexing throughput
curl http://localhost:3001/api/index/status
```

**Search Result Verification Performance**
- Real-time filesystem verification ensures accuracy but adds overhead
- Stale entries are automatically queued for cleanup to maintain performance
- Verification statistics help monitor system health and data consistency

## 📊 Monitoring & Maintenance

### Health Checks

#### Application Health
```bash
# Overall system health
curl http://localhost:3001/health

# Database connectivity
curl http://localhost:3001/api/health/database

# LucidLink status
curl http://localhost:3001/api/health/lucidlink

# Elasticsearch availability
curl http://localhost:3001/api/search/elasticsearch/availability

# Worker status
curl http://localhost:3001/api/workers/status

# Indexing status
curl http://localhost:3001/api/index/status
```

#### Service Status
```bash
# All services
docker compose ps

# Service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
docker compose logs -f elasticsearch

# Container resource usage
docker stats

# Elasticsearch cluster health
curl http://localhost:9200/_cluster/health?pretty
```

### Log Management

#### Log Locations
- **Backend logs**: `/app/logs/` (inside container)
- **PostgreSQL logs**: Docker container logs
- **Frontend logs**: Nginx access logs
- **Docker logs**: `docker compose logs`

#### Log Rotation
```bash
# Configure log rotation in docker-compose.yml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### Backup and Recovery

#### Database Backup
```bash
# Create backup
docker compose exec postgres pg_dump -U sitecache_user sitecache_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Automated backup script
./scripts/backup-database.sh
```

#### Database Restore
```bash
# Restore from backup
docker compose exec -i postgres psql -U sitecache_user -d sitecache_db < backup_file.sql

# Using restore script
./scripts/restore-database.sh backup_file.sql.gz
```

#### Full System Backup
```bash
# Backup configuration and data
tar -czf sitecache_backup_$(date +%Y%m%d).tar.gz \
  .env \
  docker-compose.yml \
  $(docker volume inspect sc-manager_postgres_data --format '{{.Mountpoint}}')
```

## 🚀 API Reference

### Authentication

All API endpoints (except health checks) require JWT authentication.

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

Response:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

#### Using Authentication
Include the JWT token in the Authorization header:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer your_token_here
```

### File Operations

#### List Root Directories
```http
GET /api/roots
Authorization: Bearer your_token_here
```

#### Browse Directory
```http
GET /api/files?path=/media/lucidlink-1/some/directory
Authorization: Bearer your_token_here
```

#### Search Files (PostgreSQL)
```http
GET /api/search?q=searchterm&limit=50&offset=0
Authorization: Bearer your_token_here

Response:
{
  "results": [...],
  "total": 25,
  "verification": {
    "originalCount": 26,
    "staleCount": 1,
    "verifiedCount": 25
  }
}
```

#### Search Files (Elasticsearch)
```http
GET /api/search/elasticsearch?q=searchterm&limit=50&offset=0
Authorization: Bearer your_token_here

Response:
{
  "results": [...],
  "total": 45,
  "originalTotal": 47,
  "took": 12,
  "verification": {
    "originalCount": 47,
    "staleCount": 2,
    "verifiedCount": 45
  }
}
```

#### Check Elasticsearch Availability
```http
GET /api/search/elasticsearch/availability
Authorization: Bearer your_token_here

Response:
{
  "available": true,
  "status": "green"
}
```

#### Generate Direct Link
```http
POST /api/direct-link
Content-Type: application/json
Authorization: Bearer your_token_here

{
  "filePath": "/media/lucidlink-1/file.pdf",
  "expirationHours": 24
}
```

### Cache Management

#### List Cache Jobs
```http
GET /api/jobs
```

#### Create Cache Job
```http
POST /api/jobs/cache
Content-Type: application/json

{
  "filePaths": ["/media/lucidlink-1/file1.mp4"],
  "profileName": "large-videos"
}
```

#### Get Job Status
```http
GET /api/jobs/{job-id}
```

#### Cancel Job
```http
POST /api/jobs/{job-id}/cancel
```

### File Indexing

#### Start Indexing
```http
POST /api/index/start
Content-Type: application/json
Authorization: Bearer your_token_here

{
  "path": "/media/lucidlink-1"
}

Response:
{
  "status": "started",
  "path": "/media/lucidlink-1",
  "message": "Indexing started in background"
}
```

#### Stop Indexing
```http
POST /api/index/stop
Authorization: Bearer your_token_here

Response:
{
  "status": "stopping"
}
```

#### Get Indexing Status
```http
GET /api/index/status
Authorization: Bearer your_token_here

Response:
{
  "running": true,
  "progress": {
    "processed_files": 1500,
    "current_path": "/media/lucidlink-1/some/path"
  }
}
```

#### Get Indexing History
```http
GET /api/index/history?limit=10
Authorization: Bearer your_token_here

Response:
[
  {
    "id": 5,
    "status": "completed",
    "total_files": 32567,
    "processed_files": 32567,
    "started_at": "2023-12-01T10:00:00Z",
    "completed_at": "2023-12-01T10:02:15Z"
  }
]
```

#### Clean Elasticsearch Orphaned Data
```http
POST /api/index/cleanup-elasticsearch
Authorization: Bearer your_token_here

Response:
{
  "message": "Cleanup completed: 15 orphaned documents deleted",
  "orphaned": 15,
  "deleted": 15,
  "errors": 0,
  "deletionPercentage": "0.1"
}
```

### System Status

#### Health Check
```http
GET /health
```

#### Worker Status
```http
GET /api/workers/status
```

#### Job Profiles
```http
GET /api/profiles
```

### WebSocket Events

Connect to `ws://localhost:3002` for real-time updates:

#### Job Updates
```json
{
  "type": "job-update",
  "jobId": "uuid",
  "status": "running",
  "completedFiles": 5,
  "totalFiles": 10
}
```

#### Network Statistics
```json
{
  "type": "lucidlink-stats", 
  "getMibps": 25.6,
  "timestamp": 1640995200000
}
```

#### Varnish Cache Statistics
```json
{
  "type": "varnish-stats",
  "bytesUsed": 50000000000,
  "totalSpace": 100000000000,
  "usagePercentage": 50.0
}
```

#### Indexing Progress Updates
```json
{
  "type": "index-progress",
  "id": 5,
  "processedFiles": 1500,
  "indexedFiles": 45,
  "skippedFiles": 1455,
  "currentPath": "/media/lucidlink-1/some/directory",
  "errors": 0
}
```

#### Indexing Complete
```json
{
  "type": "index-complete",
  "id": 5,
  "status": "completed",
  "totalFiles": 32567,
  "indexedFiles": 137,
  "skippedFiles": 32430,
  "deletedFiles": 3,
  "errors": 0,
  "duration": 4500
}
```

#### Indexing Error
```json
{
  "type": "index-error",
  "id": 5,
  "error": "Access denied to path: /media/lucidlink-1/restricted"
}
```

## 🤝 Contributing

### Development Workflow

1. **Fork and Clone**
   ```bash
   git fork <repository>
   git clone <your-fork>
   cd sc-manager
   ```

2. **Setup Development Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your development settings
   docker compose up -d
   ```

3. **Make Changes**
   - Frontend: Edit files in `frontend/src/`
   - Backend: Edit files in `backend/`
   - Database: Modify schema files in `backend/schema*.sql`

4. **Test Changes**
   ```bash
   # Restart affected services
   docker compose restart backend frontend
   
   # Check logs
   docker compose logs -f backend
   
   # Test endpoints
   curl http://localhost:3001/health
   ```

5. **Submit Pull Request**
   - Create feature branch
   - Commit with descriptive messages
   - Include tests where applicable
   - Update documentation as needed

### Code Style
- **JavaScript**: Follow ESLint configuration
- **SQL**: Use lowercase with underscores
- **Docker**: Follow best practices for multi-stage builds
- **Documentation**: Use Markdown with proper formatting

## 📄 License

[Insert your license information here]

## 🆘 Support

For issues and questions:

1. **Check Troubleshooting Section**: Common issues and solutions
2. **Review Logs**: `docker compose logs [service]`
3. **Check Health**: `curl http://localhost:3001/health`
4. **GitHub Issues**: Submit detailed bug reports
5. **Documentation**: Review this README and inline code comments

## 🗂️ Project Structure

```
sc-manager/
├── README.md                     # This comprehensive guide
├── docker-compose.yml            # Base service definitions
├── docker-compose.dev.yml        # Development overrides (hot reload)
├── docker-compose.prod.yml       # Production overrides (optimized)
├── package.json                  # Development workflow scripts
├── .env.development              # Committed development settings
├── .env.production               # Committed production settings
├── .env                         # Your active environment (copy from .env.development or .env.production)
│
├── frontend/                    # React frontend application
│   ├── src/
│   │   ├── App.js              # Main React component
│   │   └── ...                 # Additional components
│   ├── package.json            # Frontend dependencies
│   ├── Dockerfile              # Frontend container build
│   └── build/                  # Production build output
│
├── backend/                    # Node.js backend service
│   ├── server-v2.js           # Main application server
│   ├── database.js            # Database models and operations
│   ├── indexer.js             # File system indexing service
│   ├── elasticsearch-client.js # Elasticsearch integration
│   ├── package.json           # Backend dependencies
│   ├── Dockerfile             # Backend container build
│   ├── start-lucidlink.sh     # LucidLink startup script
│   ├── schema*.sql            # Database schema files
│   ├── models/                # Database models
│   ├── workers/               # Cache worker implementations
│   ├── lucidlink-stats-worker.js    # LucidLink monitoring
│   ├── varnish-stats-worker.js      # Varnish statistics
│   └── logs/                  # Application logs
│
├── varnish-stats-collector/   # Varnish statistics service
│   ├── Dockerfile            # Stats collector container
│   ├── collect-stats.sh      # Statistics collection script
│   └── ...
│
└── scripts/                  # Deployment and maintenance
    ├── setup-development.sh # Development environment setup
    ├── clean-deploy-test.sh # Clean deployment testing
    ├── deploy.sh            # Automated deployment
    ├── backup-database.sh   # Database backup
    ├── restore-database.sh  # Database restore
    └── smoke-test.sh        # Health verification
```

## 🧪 Deployment Testing

### Clean Deployment Testing

To test a completely clean deployment (recommended before production):

```bash
# Complete cleanup and fresh deployment test
./scripts/clean-deploy-test.sh

# This script will:
# - Remove ALL Docker containers, volumes, and images
# - Clean local directories
# - Backup and remove environment files
# - Run the setup script automatically
```

### Development Setup Options

```bash
# Standard setup (preserves existing Docker resources)
./scripts/setup-development.sh

# Clean setup (removes Docker resources first)
./scripts/setup-development.sh --clean

# Show help
./scripts/setup-development.sh --help
```

## 🔧 Troubleshooting

### Common Development Issues

#### Frontend shows "Network error"
- Check `SERVER_HOST` is set correctly in `.env`
- Verify backend is running: `docker compose ps`
- Check logs: `docker compose logs backend`

#### Empty file tree in BROWSER tab
- Verify LucidLink credentials in `.env`
- Check mount: `docker exec tc-mgr-backend ls /media/lucidlink-1`
- Ensure you're logged in with admin credentials

#### Terminal feature not working
- Generate SSH key: `docker exec sc-mgr-backend cat /root/.ssh/id_rsa.pub`
- Add to host: `echo '<public_key>' >> ~/.ssh/authorized_keys`
- Set SSH_HOST, SSH_USER in `.env`

#### Disk usage shows container values
- Run: `./scripts/collect-host-info.sh`
- Restart backend: `docker compose restart backend`

### Clean State Testing

If you encounter persistent issues:

1. **Full cleanup**: `./scripts/clean-deploy-test.sh`
2. **Configure**: Edit `.env` with your values
3. **Deploy**: `npm run dev`
4. **Verify**: Check all features work correctly

### Getting Help

- Check logs: `docker compose logs -f [service]`
- Health check: `curl http://localhost:3001/health`
- Documentation: See `DEVELOPMENT.md` for detailed troubleshooting

## API Gateway (Optional)

Enable the external API gateway to allow other services to submit cache jobs:

### Quick Start

```bash
# Start API gateway with the stack
docker compose -f docker-compose.yml -f docker-compose.api.yml up -d

# Test the API
curl http://localhost:8095/api/v1/health
```

### Submit a Cache Job

```bash
curl -X POST http://localhost:8095/api/v1/cache/jobs \
  -H "X-API-Key: demo-api-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["/media/lucidlink-1/video.mp4"],
    "directories": ["/media/lucidlink-1/folder"]
  }'
```

### Configuration

Add to your `.env` file:
```bash
API_GATEWAY_ENABLED=true
API_GATEWAY_PORT=8095
API_GATEWAY_KEY=your-secure-api-key
```

See `api-gateway/README.md` for complete API documentation.

## Recent Updates (v1.7.0)

### New Features
- **Video Preview System**: Batch video transcoding with DASH streaming
- **Admin Terminal**: Web-based terminal access for system administration
- **Enhanced Job Management**: Unified job panel with video preview integration
- **Redis Caching**: Improved preview metadata caching
- **nginx Default SSL**: Better support for IP-based deployments

### Container Name Changes
All containers now use the `tc-mgr-` prefix for consistency:
- `tc-mgr-backend` (was sc-mgr-backend)
- `tc-mgr-frontend` (was sc-mgr-frontend)
- `tc-mgr-postgres` (was sc-mgr-postgres)
- `tc-mgr-redis` (was sc-mgr-redis)
- `tc-mgr-elasticsearch` (was sc-mgr-elasticsearch)

This README provides complete instructions for successful deployment of the TeamCache Manager system, including all necessary configuration, security considerations, and troubleshooting guidance.
