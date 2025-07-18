# SiteCache Browser

A production-ready file system browser and cache management system for LucidLink cloud filesystems with real-time monitoring, intelligent caching, and Docker deployment.

## 🚀 Key Features

### 📁 File System Management
- **LucidLink Integration**: Native integration with LucidLink API for cloud filesystem operations
- **Interactive File Browser**: Real-time tree navigation with WebSocket updates
- **Direct Link Generation**: Secure download links for files and directories
- **Smart Indexing**: Efficient PostgreSQL-based file metadata indexing

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

### 🔒 Production Security
- **Authentication**: JWT-based admin authentication system
- **Container Security**: Non-root users, read-only filesystems, AppArmor profiles
- **FUSE Integration**: Secure filesystem mounting with proper permissions
- **Environment Configuration**: Secure credential management
- **Network Isolation**: Proper container networking and access controls

## 🏗️ Architecture Overview

```
┌─────────────────┬─────────────────┬─────────────────┐
│   Frontend      │    Backend      │    Database     │
│                 │                 │                 │
│  React SPA      │  Node.js API    │  PostgreSQL 15  │
│  WebSocket      │  Express.js     │  File Metadata  │
│  Real-time UI   │  Cache Workers  │  Job Queue      │
│  (Port 8080)    │  (Port 3001)    │  (Port 5432)    │
└─────────────────┴─────────────────┴─────────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                          │
    ┌─────────────────────┼─────────────────────┐
    │              Docker Network              │
    │                                          │
    │  ┌─────────────────┐  ┌─────────────────┐ │
    │  │  LucidLink API  │  │ Varnish Cache   │ │
    │  │  (Port 7778)    │  │ Stats Collector │ │
    │  └─────────────────┘  └─────────────────┘ │
    └──────────────────────────────────────────┘
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
- **Varnish Cache** (optional): For cache statistics integration
- **PostgreSQL**: Provided via Docker container

## 🚀 Quick Start (Development)

### 1. Clone and Setup

```bash
git clone <repository-url>
cd sc-browser
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` with your LucidLink credentials:

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
# Start all services
docker compose up -d

# Verify deployment
docker compose ps
docker compose logs backend | head -20
```

### 4. Access Application

- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **WebSocket**: ws://localhost:3002

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
cp .env.example .env.production

# Edit with production values
nano .env.production
```

**Critical Production Settings:**

```bash
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

# Security
NODE_ENV=production
SSL_CERT_PATH=/etc/ssl/certs/your-cert.pem
SSL_KEY_PATH=/etc/ssl/private/your-key.pem

# Varnish Integration (Optional)
ENABLE_VARNISH_STATS=true
VARNISH_CONTAINER_NAME=sitecache-varnish-1
VARNISH_STATS_INTERVAL=60000
```

### 2. Deploy Production Stack

```bash
# Copy environment
cp .env.production .env

# Deploy with production configuration
docker compose -f docker-compose.yml up -d

# Verify all services are healthy
docker compose ps
docker compose logs backend | grep "Starting"
```

### 3. Production Verification

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
POSTGRES_PASSWORD=your_secure_password     # PostgreSQL root password
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
```

#### Security Settings
```bash
NODE_ENV=production                     # Production mode
SSL_CERT_PATH=/path/to/cert.pem        # SSL certificate path
SSL_KEY_PATH=/path/to/key.pem          # SSL private key path
DOMAIN_NAME=your-domain.com            # Domain for SSL
```

#### Varnish Integration (Optional)
```bash
ENABLE_VARNISH_STATS=true              # Enable Varnish statistics
VARNISH_CONTAINER_NAME=varnish-1       # Varnish container name
VARNISH_STATS_INTERVAL=60000          # Stats update interval (ms)
```

### Docker Compose Configuration

The system supports multiple deployment configurations:

#### Development (`docker-compose.yml`)
- **Purpose**: Local development and testing
- **Network**: Bridge networking with port mapping
- **LucidLink**: Accesses host via `host.docker.internal`
- **Security**: Basic configuration for development ease
- **Volumes**: Direct mount of host filesystem

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
  sitecache-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
```

#### Port Security
- **3001**: Backend API (HTTP)
- **3002**: WebSocket server (WS)
- **5432**: PostgreSQL database (internal only)
- **8080**: Frontend web server (HTTP/HTTPS)

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

# Worker status
curl http://localhost:3001/api/workers/status
```

#### Service Status
```bash
# All services
docker compose ps

# Service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Container resource usage
docker stats
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
  $(docker volume inspect sc-browser_postgres_data --format '{{.Mountpoint}}')
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

#### Search Files
```http
GET /api/search?q=searchterm&path=/media/lucidlink-1
Authorization: Bearer your_token_here
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

## 🤝 Contributing

### Development Workflow

1. **Fork and Clone**
   ```bash
   git fork <repository>
   git clone <your-fork>
   cd sc-browser
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
sc-browser/
├── README.md                     # This comprehensive guide
├── docker-compose.yml            # Development environment
├── .env.example                  # Environment template
├── .env                         # Your environment (create from template)
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
    ├── deploy.sh            # Automated deployment
    ├── backup-database.sh   # Database backup
    ├── restore-database.sh  # Database restore
    └── smoke-test.sh        # Health verification
```

This README provides complete instructions for successful greenfield deployment of the SiteCache Browser system, including all necessary configuration, security considerations, and troubleshooting guidance.