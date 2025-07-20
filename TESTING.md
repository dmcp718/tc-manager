# Production Build Testing Guide

This guide provides comprehensive testing for the sc-mgr production build to ensure all functionality works correctly before deployment.

## Quick Start

```bash
# Test complete production build (HTTP only)
./test-production.sh

# Test production build with HTTPS/SSL
ENABLE_SSL=true ./test-production.sh

# Test media preview functionality (run after production test)
./test-media-previews.sh
```

## Test Suite Overview

### 1. Production Build Test (`test-production.sh`)

**What it tests:**
- ✅ Docker image builds
- ✅ Service startup and health checks
- ✅ Database connectivity
- ✅ Authentication system
- ✅ File listing API
- ✅ Elasticsearch integration
- ✅ Redis connectivity
- ✅ Preview cache setup
- ✅ RUI (Remote Upload Indicator) system
- ✅ WebSocket connections
- ✅ Frontend asset serving
- ✅ Security headers

**Prerequisites:**
- Docker and Docker Compose installed
- `curl`, `jq`, and `nc` utilities available
- Ports 3001, 5432, 6379, 8080, 9200 available

**Expected Duration:** 5-10 minutes

### 2. Media Preview Test (`test-media-previews.sh`)

**What it tests:**
- 🎬 Direct video streaming (MP4, WebM)
- 🎬 HLS transcoding (MXF, MOV, ProRes)
- 🎬 Unsupported format handling (BRAW, R3D)
- 🎬 Preview cache persistence
- 🎬 Authentication with video streams

**Prerequisites:**
- Production services running (run `test-production.sh` first)
- Sample media files available (optional, tests will skip if not found)

**Expected Duration:** 2-5 minutes

## Running Tests

### Step 1: Production Build Test

```bash
cd /path/to/sc-manager

# HTTP only (default)
./test-production.sh

# OR with HTTPS/SSL support
ENABLE_SSL=true ./test-production.sh
```

This will:
1. Clean any existing containers
2. Generate SSL certificates (if ENABLE_SSL=true)
3. Build production Docker images
4. Start all services
5. Run comprehensive functionality tests
6. Test HTTPS functionality (if enabled)
7. Leave services running for further testing

### Step 2: Media Preview Test (Optional)

```bash
# Run after production test completes
./test-media-previews.sh
```

### Step 3: Manual Testing (Optional)

Access the application:
- **Frontend:** http://localhost:8080
- **HTTPS Frontend:** https://localhost:443 (if SSL enabled)
- **Backend API:** http://localhost:3001
- **Login:** admin / admin123

If using HTTPS:
1. Browser will show security warning (self-signed certificate)
2. Click "Advanced" → "Proceed to localhost" to continue
3. Or install the certificate using `./ssl/install-cert.sh`

### Step 4: Cleanup

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```

## SSL Certificate Generation

### Automatic Generation

SSL certificates are automatically generated when using `ENABLE_SSL=true`:

```bash
# Automatically generates certificates and tests HTTPS
ENABLE_SSL=true ./test-production.sh
```

### Manual Generation

You can also generate certificates manually:

```bash
# Generate certificates for auto-detected IP
./scripts/generate-ssl-cert.sh

# Force regeneration
./scripts/generate-ssl-cert.sh --force

# Use custom IP address
SSL_HOST_IP=192.168.1.100 ./scripts/generate-ssl-cert.sh
```

### Generated Files

- `ssl/sc-mgr.crt` - SSL certificate
- `ssl/sc-mgr.key` - Private key
- `ssl/nginx-ssl.conf` - Nginx SSL configuration
- `ssl/install-cert.sh` - Certificate installation helper
- `docker-compose.ssl.yml` - HTTPS Docker override

### Using HTTPS in Production

```bash
# Start with HTTPS enabled
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d
```

## Test Configuration

### Environment Variables

```bash
# Custom preview cache location
export PREVIEW_CACHE_HOST_PATH="/custom/path/to/previews"

# Custom database password
export POSTGRES_PASSWORD="your_secure_password"

# LucidLink configuration
export LUCIDLINK_FILESPACE="your_filespace"
export LUCIDLINK_USER="your_user"
export LUCIDLINK_PASSWORD="your_password"
```

### Sample Media Files

For complete media preview testing, ensure these sample files exist:
```
/media/lucidlink-1/00_Media/Video_codec_samples/
├── CAM_B-Broadband-High.mp4        # Direct streaming test
├── scientists_ProResProxy.mxf       # HLS transcoding test
├── CAM_C_ProRes422.mov             # MOV transcoding test
└── A006_09261608_C013.braw         # Unsupported format test
```

## Expected Results

### ✅ Successful Test Output

```
🚀 Starting Production Build Test Suite
======================================
🧪 Testing: Environment setup
✅ Environment setup completed
🧪 Testing: Docker image builds
✅ Docker images built successfully
🧪 Testing: Service startup
✅ All services started successfully
🧪 Testing: Database connection
✅ Database connection successful
🧪 Testing: Authentication system
✅ Authentication successful
...
🎉 Production Build Test Suite Completed Successfully!
```

### ⚠️ Common Warnings (Normal)

- **File listing empty:** Normal if LucidLink not mounted
- **Elasticsearch not available:** Normal for fresh deployments
- **RUI system not functional:** Normal without LucidLink API access
- **Security headers missing:** Expected without reverse proxy

### ❌ Critical Failures

If tests fail, check:
1. **Port conflicts:** Ensure ports 3001, 5432, 6379, 8080, 9200 are free
2. **Docker resources:** Ensure sufficient memory/CPU
3. **Dependencies:** Verify curl, jq, nc are installed
4. **Permissions:** Check Docker permissions and file access

## Greenfield Deployment Test

To test a fresh deployment from git:

```bash
# Clone repository
git clone <your-repo-url> sc-mgr-fresh
cd sc-mgr-fresh/sc-manager

# Run production tests
./test-production.sh
./test-media-previews.sh

# Cleanup
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
```

## Production Checklist

Before deploying to production:

- [ ] All tests pass without critical failures
- [ ] Preview cache directory exists and is writable
- [ ] Environment variables configured appropriately
- [ ] LucidLink credentials provided (if using RUI)
- [ ] Firewall rules configured for required ports
- [ ] SSL certificates ready (if using HTTPS)
- [ ] Backup strategy in place for database
- [ ] Monitoring and logging configured

## Troubleshooting

### Database Connection Issues
```bash
# Check database logs
docker logs sc-mgr-postgres

# Test direct connection
docker exec sc-mgr-postgres pg_isready -U sitecache_user -d sitecache_db
```

### Preview Cache Issues
```bash
# Check mount permissions
docker exec sc-mgr-backend-prod ls -la /app/preview-cache

# Check host directory
ls -la /var/sc-mgr/previews  # or your custom path
```

### Service Health Issues
```bash
# Check service status
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Check service logs
docker logs sc-mgr-backend-prod
docker logs sc-mgr-frontend-prod
```

## Support

If tests fail or you encounter issues:
1. Check the logs using commands above
2. Verify all prerequisites are met
3. Ensure no conflicting services are running
4. Review Docker resource allocation