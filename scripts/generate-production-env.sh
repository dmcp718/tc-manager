#!/bin/bash

# Generate complete production .env file for TeamCache Manager v1.8.0
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
POSTGRES_PASSWORD=$(openssl rand -base64 18 | tr -d "=")

# Get user input for required values
echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""

read -p "Server hostname or IP (e.g., teamcache.example.com): " SERVER_HOST

# Configure first filespace (required)
echo -e "\n${YELLOW}Configure Primary LucidLink Filespace:${NC}"
read -p "LucidLink Filespace 1 (e.g., filespace.domain): " LUCIDLINK_FILESPACE_1
read -p "LucidLink username 1 (email): " LUCIDLINK_USER_1
read -sp "LucidLink password 1: " LUCIDLINK_PASSWORD_1
echo ""

# Ask about second filespace (optional)
read -p "Do you want to configure a second filespace? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\n${YELLOW}Configure Secondary LucidLink Filespace:${NC}"
    read -p "LucidLink Filespace 2 (e.g., filespace2.domain): " LUCIDLINK_FILESPACE_2
    read -p "LucidLink username 2 (email): " LUCIDLINK_USER_2
    read -sp "LucidLink password 2: " LUCIDLINK_PASSWORD_2
    echo ""
    ENABLE_SECOND_FILESPACE=true
else
    ENABLE_SECOND_FILESPACE=false
    echo -e "${GREEN}✅ Configuring single filespace${NC}"
fi
read -sp "Web app admin user password (press Enter to generate random): " ADMIN_PASSWORD
echo ""
if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d "=")
    echo -e "${GREEN}✅ Generated random admin password${NC}"
else
    echo -e "${GREEN}✅ Using provided admin password${NC}"
fi
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

read -p "Grafana URL (default: http://$SERVER_HOST:3000): " GRAFANA_URL
GRAFANA_URL=${GRAFANA_URL:-http://$SERVER_HOST:3000}

# Varnish configuration (required for LucidLink S3 proxy)
DEFAULT_VARNISH_SERVER="http://$SERVER_HOST:80"
read -p "Varnish server endpoint (default: $DEFAULT_VARNISH_SERVER): " VARNISH_SERVER
VARNISH_SERVER=${VARNISH_SERVER:-$DEFAULT_VARNISH_SERVER}
VARNISH_CONTAINER_NAME=varnish
VARNISH_STATS_INTERVAL=60000
echo -e "${GREEN}✅ Varnish configuration set: $VARNISH_SERVER${NC}"

# Set frontend URLs based on SSL configuration
if [ "$SSL_ENABLED" = true ]; then
    # For HTTPS, use path-based routing
    REACT_APP_API_URL="$PROTOCOL://$SERVER_HOST/api"
    REACT_APP_WS_URL="$WS_PROTOCOL://$SERVER_HOST/ws"
else
    # For non-SSL, use nginx proxy on port 8090
    REACT_APP_API_URL="$PROTOCOL://$SERVER_HOST:8090/api"
    REACT_APP_WS_URL="$WS_PROTOCOL://$SERVER_HOST:8090/ws"
fi

# Create complete .env file
cat > "$PROJECT_DIR/.env" << EOF
# TeamCache Manager Production Environment Configuration
# Generated on $(date)
# Version: 1.8.0

# Docker Compose Project Name
COMPOSE_PROJECT_NAME=tc-mgr

# Database Configuration
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_USER=teamcache_user
POSTGRES_DB=teamcache_db
DB_NAME=teamcache_db
DB_USER=teamcache_user
DB_PASSWORD=$POSTGRES_PASSWORD
DB_HOST=postgres
DB_PORT=5432

# Application Configuration
NODE_ENV=production
PORT=3001
WEBSOCKET_PORT=3002
SERVER_HOST=$SERVER_HOST

# LucidLink Configuration - Shared Settings
LUCIDLINK_COMMAND=/usr/local/bin/lucid
LUCID_S3_PROXY=$VARNISH_SERVER
LUCIDLINK_API_HOST=host.docker.internal
ENABLE_LUCIDLINK_STATS=true
LUCIDLINK_INCLUDE_GET_TIME=true

# LucidLink Filespace 1
LUCIDLINK_MOUNT_POINT_1=/media/lucidlink-1
LUCIDLINK_FILESPACE_1=$LUCIDLINK_FILESPACE_1
LUCIDLINK_USER_1=$LUCIDLINK_USER_1
LUCIDLINK_PASSWORD_1=$LUCIDLINK_PASSWORD_1
LUCIDLINK_INSTANCE_1=2001
LUCIDLINK_FS_1_PORT=7778
# LUCIDLINK_API_PORT_1=9780  # Auto-detected from lucid list (typically 9779)

# LucidLink Filespace 2 (Optional)
EOF

if [ "$ENABLE_SECOND_FILESPACE" = true ]; then
cat >> "$PROJECT_DIR/.env" << EOF
LUCIDLINK_MOUNT_POINT_2=/media/lucidlink-2
LUCIDLINK_FILESPACE_2=$LUCIDLINK_FILESPACE_2
LUCIDLINK_USER_2=$LUCIDLINK_USER_2
LUCIDLINK_PASSWORD_2=$LUCIDLINK_PASSWORD_2
LUCIDLINK_INSTANCE_2=2002
LUCIDLINK_FS_2_PORT=7779
# LUCIDLINK_API_PORT_2=9781  # Auto-detected from lucid list (typically 9780)

# Combined paths (includes both filespaces)
INDEX_ROOT_PATHS=/media/lucidlink-1,/media/lucidlink-2
ALLOWED_PATHS=/media/lucidlink-1,/media/lucidlink-2
EOF
else
cat >> "$PROJECT_DIR/.env" << EOF
# LUCIDLINK_MOUNT_POINT_2=/media/lucidlink-2
# LUCIDLINK_FILESPACE_2=
# LUCIDLINK_USER_2=
# LUCIDLINK_PASSWORD_2=
# LUCIDLINK_INSTANCE_2=2002
# LUCIDLINK_FS_2_PORT=7779
# LUCIDLINK_API_PORT_2=9781  # Auto-detected from lucid list

# Combined paths (single filespace)
INDEX_ROOT_PATHS=/media/lucidlink-1
ALLOWED_PATHS=/media/lucidlink-1
EOF
fi

cat >> "$PROJECT_DIR/.env" << EOF

# Legacy support (maps to filespace 1 for backward compatibility)
LUCIDLINK_MOUNT_POINT=/media/lucidlink-1
INDEX_ROOT_PATH=/media/lucidlink-1
LUCIDLINK_FILESPACE=$LUCIDLINK_FILESPACE_1
LUCIDLINK_USER=$LUCIDLINK_USER_1
LUCIDLINK_PASSWORD=$LUCIDLINK_PASSWORD_1
# LUCIDLINK_API_PORT=9780  # Auto-detected from lucid list (legacy fallback)

# Authentication
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=8h
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Frontend Configuration
REACT_APP_API_URL=$REACT_APP_API_URL
REACT_APP_WS_URL=$REACT_APP_WS_URL
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

# Varnish Stats
ENABLE_VARNISH_STATS=true
VARNISH_STATS_INTERVAL=$VARNISH_STATS_INTERVAL
VARNISH_CONTAINER_NAME=$VARNISH_CONTAINER_NAME
VARNISH_SERVER=$VARNISH_SERVER

# API Gateway Configuration
API_GATEWAY_ENABLED=true
API_GATEWAY_PORT=8095
API_GATEWAY_KEY=demo-api-key-2024
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
    echo "   API URL: $PROTOCOL://$SERVER_HOST:8090/api"
    echo "   WebSocket URL: $WS_PROTOCOL://$SERVER_HOST:8090/ws"
fi
echo "   Primary Filespace: $LUCIDLINK_FILESPACE_1"
echo "   Primary User: $LUCIDLINK_USER_1"
if [ "$ENABLE_SECOND_FILESPACE" = true ]; then
  echo "   Secondary Filespace: $LUCIDLINK_FILESPACE_2"
  echo "   Secondary User: $LUCIDLINK_USER_2"
fi
echo "   Varnish Server (S3 Proxy): $VARNISH_SERVER"
echo ""
echo -e "${GREEN}🔒 Security notes:${NC}"
echo "   - The .env file has been created with restricted permissions (600)"
echo "   - Keep the admin password safe - you'll need it to log in"
echo "   - Change the default API Gateway key (demo-api-key-2024) for production!"
echo "   - Never commit the .env file to version control"
echo ""
echo -e "${GREEN}📂 File location:${NC}"
echo "   $PROJECT_DIR/.env"
echo ""
echo -e "${YELLOW}🔧 Features included in v1.8.0:${NC}"
echo "   - Multi-filespace LucidLink support with visual identification"
echo "   - API Gateway for external integrations (enabled by default on port 8095)"
echo "   - Fixed DIRECT LINK buttons with proper multi-filespace routing" 
echo "   - Dynamic LucidLink API port detection from 'lucid list'"
echo "   - Varnish statistics collection and caching integration"
echo "   - Elasticsearch search indexing with real-time synchronization"
echo "   - Redis caching layer for preview metadata and sessions"
echo "   - Video transcoding with HLS/DASH streaming support"
echo "   - Integrated SSL deployment with nginx/Caddy options"
echo ""
echo -e "${YELLOW}🚀 Next steps:${NC}"
echo "   1. Verify configuration: ./scripts/verify-env.sh"
echo "   2. Deploy TeamCache Manager:"
if [ "$SSL_ENABLED" = "true" ]; then
    echo "      ./scripts/deploy-production.sh        # Default: nginx with self-signed SSL"
    echo ""
    echo "      Alternative options:"
    echo "      ./scripts/deploy-production.sh caddy  # Best for domain names with Let's Encrypt"
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