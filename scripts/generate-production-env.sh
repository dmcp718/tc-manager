#!/bin/bash

# Generate complete production .env file for TeamCache Manager v1.7.0
set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔐 Generating complete production .env file...${NC}"
echo ""

# Check if .env already exists
if [ -f "$PROJECT_DIR/.env" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file already exists!${NC}"
    read -p "Do you want to backup and overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
    # Backup existing .env
    mv "$PROJECT_DIR/.env" "$PROJECT_DIR/.env.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${GREEN}✅ Existing .env backed up${NC}"
fi

# Generate secure values
JWT_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d "=")
POSTGRES_PASSWORD=$(openssl rand -base64 18 | tr -d "=")

# Get user input for required values
echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""

read -p "Server hostname or IP (e.g., teamcache.example.com): " SERVER_HOST
read -p "LucidLink Filespace (e.g., filespace.domain): " LUCIDLINK_FILESPACE
read -p "LucidLink username (email): " LUCIDLINK_USER
read -sp "LucidLink password: " LUCIDLINK_PASSWORD
echo ""
read -p "Disable SSL/HTTPS? (For development only) (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SSL_ENABLED=false
    PROTOCOL="http"
    WS_PROTOCOL="ws"
    echo -e "${YELLOW}⚠️  WARNING: SSL disabled - use only for development!${NC}"
else
    SSL_ENABLED=true
    PROTOCOL="https"
    WS_PROTOCOL="wss"
    echo -e "${GREEN}✅ Using HTTPS with automatic certificates (default)${NC}"
fi

read -p "Grafana URL (default: $PROTOCOL://$SERVER_HOST:3000): " GRAFANA_URL
GRAFANA_URL=${GRAFANA_URL:-$PROTOCOL://$SERVER_HOST:3000}

# Create complete .env file
cat > "$PROJECT_DIR/.env" << EOF
# TeamCache Manager Production Environment Configuration
# Generated on $(date)
# Version: 1.7.0

# Database Configuration
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_USER=teamcache_user
POSTGRES_DB=teamcache_db
DB_HOST=postgres
DB_PORT=5432

# Application Configuration
NODE_ENV=production
PORT=3001
WEBSOCKET_PORT=3002
SERVER_HOST=$SERVER_HOST

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
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Frontend Configuration
if [ "$SSL_ENABLED" = true ]; then
    # For HTTPS with Caddy, use path-based routing
    REACT_APP_API_URL=$PROTOCOL://$SERVER_HOST/api
    REACT_APP_WS_URL=$WS_PROTOCOL://$SERVER_HOST/ws
else
    # For non-SSL, use port-based routing
    REACT_APP_API_URL=$PROTOCOL://$SERVER_HOST:3001/api
    REACT_APP_WS_URL=$WS_PROTOCOL://$SERVER_HOST:3002
fi
REACT_APP_LUCIDLINK_MOUNT_POINT=/media/lucidlink-1
REACT_APP_GRAFANA_URL=$GRAFANA_URL

# Grafana Configuration
GRAFANA_URL=$GRAFANA_URL

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

# Set proper permissions
chmod 600 "$PROJECT_DIR/.env"

echo ""
echo -e "${GREEN}✅ Production .env file generated successfully!${NC}"
echo ""
echo -e "${YELLOW}📋 Generated credentials:${NC}"
echo "   Admin Username: admin"
echo "   Admin Password: $ADMIN_PASSWORD"
echo "   JWT Secret: ${JWT_SECRET:0:16}..."
echo "   PostgreSQL Password: ${POSTGRES_PASSWORD:0:8}..."
echo ""
echo -e "${YELLOW}📝 Configuration summary:${NC}"
echo "   Server: $SERVER_HOST"
echo "   SSL/HTTPS: $SSL_ENABLED"
if [ "$SSL_ENABLED" = true ]; then
    echo "   API URL: $PROTOCOL://$SERVER_HOST/api"
    echo "   WebSocket URL: $WS_PROTOCOL://$SERVER_HOST/ws"
else
    echo "   API URL: $PROTOCOL://$SERVER_HOST:3001/api"
    echo "   WebSocket URL: $WS_PROTOCOL://$SERVER_HOST:3002"
fi
echo "   LucidLink Filespace: $LUCIDLINK_FILESPACE"
echo "   LucidLink User: $LUCIDLINK_USER"
echo ""
echo -e "${GREEN}🔒 Security notes:${NC}"
echo "   - The .env file has been created with restricted permissions (600)"
echo "   - Keep the admin password safe - you'll need it to log in"
echo "   - Never commit the .env file to version control"
echo ""
echo -e "${GREEN}📂 File location:${NC}"
echo "   $PROJECT_DIR/.env"
echo ""
echo -e "${YELLOW}🚀 Next steps:${NC}"
echo "   1. Verify configuration: ./scripts/verify-env.sh"
echo "   2. Deploy TeamCache Manager:"
if [ "$SSL_ENABLED" = "true" ]; then
    echo "      ./scripts/deploy-production.sh        # Default: nginx with self-signed SSL"
    echo ""
    echo "      Alternative options:"
    echo "      ./scripts/deploy-production.sh caddy  # Use Caddy for domain names"
else
    echo "      ./scripts/deploy-production.sh none   # Without SSL (dev only)"
fi
echo "   3. Run smoke tests: ./scripts/smoke-test.sh"
echo ""
echo -e "${YELLOW}📝 Additional notes:${NC}"
if [ "$SSL_ENABLED" = "true" ]; then
    echo "   - Caddy will automatically generate self-signed certificates for IPs"
    echo "   - For domain names, Caddy will obtain Let's Encrypt certificates"
    echo "   - Custom certificates can be placed in ./ssl/ directory"
else
    echo "   - SSL is strongly recommended for production deployments"
    echo "   - Run this script again to regenerate with HTTPS enabled"
fi
echo "   - View logs: docker compose logs -f"
echo "   - Stop services: docker compose down"