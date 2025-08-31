#!/bin/bash
set -e

# Package Builder for TeamCache Manager
# Creates portable packages without hardcoded deployment-specific values

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Build configuration
BUILD_TIME=$(date +%Y%m%d_%H%M%S)
BUILD_VERSION="${BUILD_VERSION:-1.8.0}"
PACKAGE_NAME="tc-mgr-${BUILD_VERSION}-${BUILD_TIME}.tar.gz"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              TeamCache Manager Package Builder                 ║${NC}"
echo -e "${BLUE}║                    Creating Portable Package                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}Version:${NC} ${BUILD_VERSION}"
echo -e "${GREEN}Build Time:${NC} ${BUILD_TIME}"
echo -e "${GREEN}Package:${NC} ${PACKAGE_NAME}"
echo

# Create build directory
BUILD_DIR="${PROJECT_DIR}/builds/${BUILD_TIME}"
mkdir -p "${BUILD_DIR}"

# Check for LucidLink binary (look in standard location)
LUCIDLINK_DIR="/home/ubuntu/lucidlink-builds"
LUCIDLINK_DEB=""

# First check for the specific version (backward compatibility)
if [ -f "${LUCIDLINK_DIR}/lucidlink_3.2.6817_amd64.deb" ]; then
    LUCIDLINK_DEB="lucidlink_3.2.6817_amd64.deb"
    echo -e "${GREEN}✓ Found LucidLink binary: ${LUCIDLINK_DEB}${NC}"
else
    # Look for any .deb file in the directory
    DEB_FILES=($(ls "${LUCIDLINK_DIR}"/*.deb 2>/dev/null || true))
    
    if [ ${#DEB_FILES[@]} -eq 0 ]; then
        echo -e "${YELLOW}⚠️  Warning: No LucidLink .deb files found in ${LUCIDLINK_DIR}${NC}"
        echo -e "${YELLOW}   The backend container will not have LucidLink installed.${NC}"
        read -p "Continue without LucidLink? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    elif [ ${#DEB_FILES[@]} -eq 1 ]; then
        LUCIDLINK_DEB=$(basename "${DEB_FILES[0]}")
        echo -e "${GREEN}✓ Found LucidLink binary: ${LUCIDLINK_DEB}${NC}"
    else
        echo -e "${YELLOW}⚠️  Warning: Multiple .deb files found in ${LUCIDLINK_DIR}:${NC}"
        for deb in "${DEB_FILES[@]}"; do
            echo "     - $(basename "$deb")"
        done
        LUCIDLINK_DEB=$(basename "${DEB_FILES[0]}")
        echo -e "${YELLOW}   Using: ${LUCIDLINK_DEB}${NC}"
    fi
fi

# Build Backend Docker image (no environment-specific values)
echo -e "${BLUE}Building backend Docker image...${NC}"
BUILD_ARGS=""
if [ -n "${LUCIDLINK_DEB}" ]; then
    BUILD_ARGS="--build-arg LUCIDLINK_DEB_FILENAME=${LUCIDLINK_DEB}"
fi
docker build \
    --target production \
    ${BUILD_ARGS} \
    --tag tc-mgr-backend:${BUILD_VERSION} \
    --tag tc-mgr-backend:latest \
    --file "${PROJECT_DIR}/backend/Dockerfile" \
    --build-context lucidlink-builds="${LUCIDLINK_DIR}" \
    "${PROJECT_DIR}/backend"

# Build Frontend Docker image (no build args - runtime config only)
echo -e "${BLUE}Building frontend Docker image...${NC}"
docker build \
    --target production \
    --tag tc-mgr-frontend:${BUILD_VERSION} \
    --tag tc-mgr-frontend:latest \
    --file "${PROJECT_DIR}/frontend/Dockerfile" \
    "${PROJECT_DIR}/frontend"

# Build Varnish Stats Collector image
echo -e "${BLUE}Building varnish stats collector Docker image...${NC}"
docker build \
    --tag tc-mgr-varnish-stats:${BUILD_VERSION} \
    --tag tc-mgr-varnish-stats:latest \
    "${PROJECT_DIR}/varnish-stats-collector"

# Export Docker images
echo -e "${BLUE}Exporting Docker images...${NC}"
docker save tc-mgr-backend:${BUILD_VERSION} | gzip > "${BUILD_DIR}/tc-mgr-backend-${BUILD_VERSION}.tar.gz"
docker save tc-mgr-frontend:${BUILD_VERSION} | gzip > "${BUILD_DIR}/tc-mgr-frontend-${BUILD_VERSION}.tar.gz"
docker save tc-mgr-varnish-stats:${BUILD_VERSION} | gzip > "${BUILD_DIR}/tc-mgr-varnish-stats-${BUILD_VERSION}.tar.gz"

# Copy Docker Compose files
echo -e "${BLUE}Copying configuration files...${NC}"
for file in docker-compose.yml docker-compose.prod.yml docker-compose.production.yml \
            docker-compose.ssl.yml docker-compose.package.yml; do
    if [ -f "${PROJECT_DIR}/$file" ]; then
        cp "${PROJECT_DIR}/$file" "${BUILD_DIR}/"
    fi
done

# Copy necessary directories
for dir in scripts ssl; do
    if [ -d "${PROJECT_DIR}/$dir" ]; then
        mkdir -p "${BUILD_DIR}/$dir"
        rsync -av --exclude='*.log' --exclude='.git' \
              "${PROJECT_DIR}/$dir/" "${BUILD_DIR}/$dir/"
    fi
done

# Copy nginx configuration files from frontend
if [ -d "${PROJECT_DIR}/frontend" ]; then
    mkdir -p "${BUILD_DIR}/frontend"
    cp "${PROJECT_DIR}"/frontend/nginx*.conf "${BUILD_DIR}/frontend/" 2>/dev/null || true
    cp "${PROJECT_DIR}"/frontend/docker-entrypoint.sh "${BUILD_DIR}/frontend/" 2>/dev/null || true
fi

# Copy schema and migration files from backend
if [ -d "${PROJECT_DIR}/backend" ]; then
    # Copy schema files
    mkdir -p "${BUILD_DIR}/schema"
    cp "${PROJECT_DIR}"/backend/schema*.sql "${BUILD_DIR}/schema/" 2>/dev/null || true
    
    # Copy migration files
    if [ -d "${PROJECT_DIR}/backend/migrations" ]; then
        mkdir -p "${BUILD_DIR}/migrations"
        cp -r "${PROJECT_DIR}/backend/migrations/"*.sql "${BUILD_DIR}/migrations/" 2>/dev/null || true
    fi
fi

# Create bootstrap installer
cat > "${BUILD_DIR}/install.sh" << 'INSTALLER_EOF'
#!/bin/bash
set -e

# TeamCache Manager Bootstrap Installer
# This script configures and deploys TeamCache Manager on a new server

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          TeamCache Manager Bootstrap Installer                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo

# Get server configuration
read -p "Enter server hostname or IP address: " SERVER_HOST
read -p "Enable HTTPS? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SSL_ENABLED=true
    PROTOCOL="https"
    WS_PROTOCOL="wss"
else
    SSL_ENABLED=false
    PROTOCOL="http"
    WS_PROTOCOL="ws"
    # For non-SSL, nginx runs on port 8091 and proxies to backend
    DEPLOYMENT_PORT="8091"
fi

# Get LucidLink configuration
echo
echo -e "${BLUE}LucidLink Configuration${NC}"
read -p "LucidLink Filespace: " LUCIDLINK_FILESPACE
read -p "LucidLink Username: " LUCIDLINK_USER
read -s -p "LucidLink Password: " LUCIDLINK_PASSWORD
echo

# Get admin credentials
echo
echo -e "${BLUE}Admin User Configuration${NC}"
read -p "Admin Username [admin]: " ADMIN_USERNAME
ADMIN_USERNAME=${ADMIN_USERNAME:-admin}
read -s -p "Admin Password: " ADMIN_PASSWORD
echo

# Generate secure passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
JWT_SECRET=$(openssl rand -hex 32)

# Create .env file
cat > .env << EOF
# TeamCache Manager Configuration
# Generated by Bootstrap Installer

COMPOSE_PROJECT_NAME=tc-mgr
BUILD_VERSION=BUILD_VERSION_PLACEHOLDER

# Server Configuration
SERVER_HOST=$SERVER_HOST
NODE_ENV=production
PORT=3001
WEBSOCKET_PORT=3002

# Frontend Runtime Configuration
# Always use relative paths for nginx proxy
FRONTEND_API_URL=/api
FRONTEND_WS_URL=/ws
FRONTEND_GRAFANA_URL=http://$SERVER_HOST:3000

# Database Configuration
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DB_HOST=postgres
DB_PORT=5432
DB_NAME=teamcache_db
DB_USER=teamcache_user

# LucidLink Configuration
LUCIDLINK_MOUNT_POINT=/media/lucidlink-1
INDEX_ROOT_PATH=/media/lucidlink-1
ALLOWED_PATHS=/media/lucidlink-1
LUCIDLINK_COMMAND=/usr/local/bin/lucid
LUCIDLINK_FS_1_PORT=7778
LUCIDLINK_API_HOST=host.docker.internal
LUCIDLINK_API_PORT=9780
LUCIDLINK_FILESPACE=$LUCIDLINK_FILESPACE
LUCIDLINK_USER=$LUCIDLINK_USER
LUCIDLINK_PASSWORD=$LUCIDLINK_PASSWORD
LUCID_S3_PROXY=http://$SERVER_HOST:80
ENABLE_LUCIDLINK_STATS=true
LUCIDLINK_INCLUDE_GET_TIME=true

# Authentication
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=8h
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD

# SSL Configuration
SSL_ENABLED=$SSL_ENABLED
DOMAIN_NAME=$SERVER_HOST

# Elasticsearch Configuration
ELASTICSEARCH_HOST=elasticsearch
ELASTICSEARCH_PORT=9200
ELASTICSEARCH_INDEX=teamcache-files
ELASTICSEARCH_SYNC_DELETIONS=true

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379

# Performance Tuning
CACHE_WORKER_COUNT=4
MAX_CONCURRENT_FILES=5
WORKER_POLL_INTERVAL=2000
UV_THREADPOOL_SIZE=16
NODE_OPTIONS=--max-old-space-size=3072

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Media Preview Cache
PREVIEW_CACHE_HOST_PATH=/var/tc-mgr/previews
PREVIEW_CACHE_DIR=/app/preview-cache

# Video Transcoding Settings
TRANSCODE_VIDEO_BITRATE=1000k
TRANSCODE_VIDEO_MAXRATE=1500k
TRANSCODE_VIDEO_BUFSIZE=2000k
TRANSCODE_VIDEO_WIDTH=1280
TRANSCODE_VIDEO_HEIGHT=720
TRANSCODE_AUDIO_BITRATE=128k
TRANSCODE_AUDIO_CODEC=aac
TRANSCODE_AUDIO_CHANNELS=2
TRANSCODE_AUDIO_SAMPLE_RATE=48000
TRANSCODE_HLS_SEGMENT_TIME=2
TRANSCODE_CONTAINER_FORMAT=hls

# RUI Configuration (disabled by default)
ENABLE_RUI=false
RUI_SCAN_INTERVAL=30000
RUI_MONITOR_INTERVAL=2000
RUI_BATCH_SIZE=100
RUI_MAX_CONCURRENT_MONITORS=10
ENABLE_RUI_FILESYSTEM_SCANNER=false

# Network Stats (disabled for production)
ENABLE_NETWORK_STATS=false
NETWORK_INTERFACE=eth0

# Varnish Stats (optional)
ENABLE_VARNISH_STATS=false
VARNISH_STATS_INTERVAL=60000
VARNISH_CONTAINER_NAME=sitecache-varnish-1
EOF

echo -e "${GREEN}✓ Configuration generated${NC}"

# Load Docker images
echo -e "${BLUE}Loading Docker images...${NC}"
for image in tc-mgr-backend tc-mgr-frontend tc-mgr-varnish-stats; do
    if [ -f "${image}-BUILD_VERSION_PLACEHOLDER.tar.gz" ]; then
        gunzip -c "${image}-BUILD_VERSION_PLACEHOLDER.tar.gz" | docker load
    fi
done

# Generate SSL certificates if needed
if [ "$SSL_ENABLED" = "true" ]; then
    echo -e "${BLUE}Generating SSL certificates...${NC}"
    ./scripts/generate-ssl-cert.sh
fi

# Deploy the application
echo -e "${BLUE}Deploying TeamCache Manager...${NC}"
if [ "$SSL_ENABLED" = true ]; then
    ./scripts/deploy-production.sh nginx
else
    ./scripts/deploy-production.sh none
fi

echo
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           TeamCache Manager Deployed Successfully!             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo
if [ "$SSL_ENABLED" = true ]; then
    echo -e "${GREEN}Access the application at:${NC} $PROTOCOL://$SERVER_HOST"
else
    echo -e "${GREEN}Access the application at:${NC} $PROTOCOL://$SERVER_HOST:8091"
fi
echo -e "${GREEN}Admin credentials:${NC} $ADMIN_USERNAME / [password you entered]"
echo
echo -e "${YELLOW}Important: Save your .env file securely!${NC}"
INSTALLER_EOF

# Replace placeholders in installer
sed -i "s/BUILD_VERSION_PLACEHOLDER/${BUILD_VERSION}/g" "${BUILD_DIR}/install.sh"
chmod +x "${BUILD_DIR}/install.sh"

# Create deployment instructions
cat > "${BUILD_DIR}/README.md" << EOF
# TeamCache Manager v${BUILD_VERSION}

## Quick Start

1. Extract the package on your target server:
   \`\`\`bash
   tar -xzf ${PACKAGE_NAME}
   cd tc-mgr-${BUILD_VERSION}-${BUILD_TIME}
   \`\`\`

2. Run the installer:
   \`\`\`bash
   ./install.sh
   \`\`\`

3. Follow the prompts to configure your deployment.

## Manual Deployment

If you prefer to configure manually:

1. Load Docker images:
   \`\`\`bash
   gunzip -c tc-mgr-backend-${BUILD_VERSION}.tar.gz | docker load
   gunzip -c tc-mgr-frontend-${BUILD_VERSION}.tar.gz | docker load
   gunzip -c tc-mgr-varnish-stats-${BUILD_VERSION}.tar.gz | docker load
   \`\`\`

2. Create your .env file (see install.sh for template)

3. Deploy:
   \`\`\`bash
   ./scripts/deploy-production.sh
   \`\`\`

## Package Contents

- Docker images (backend, frontend, varnish-stats)
- Docker Compose configuration files
- Deployment scripts
- Database schemas and migrations
- SSL certificate generation tools

## Support

For issues or questions, please contact your system administrator.

Built on: ${BUILD_TIME}
EOF

# Create the package
cd "${PROJECT_DIR}/builds"
echo -e "${BLUE}Creating package: ${PACKAGE_NAME}${NC}"
tar -czf "../${PACKAGE_NAME}" "${BUILD_TIME}"

# Calculate package size
PACKAGE_SIZE=$(ls -lh "../${PACKAGE_NAME}" | awk '{print $5}')

echo
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Package Build Complete!                           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}Package:${NC} ${PACKAGE_NAME}"
echo -e "${GREEN}Size:${NC} ${PACKAGE_SIZE}"
echo -e "${GREEN}Location:${NC} ${PROJECT_DIR}/${PACKAGE_NAME}"
echo
echo -e "${YELLOW}This package is fully portable and can be deployed on any server.${NC}"
echo -e "${YELLOW}No hardcoded IPs or credentials are included in the images.${NC}"