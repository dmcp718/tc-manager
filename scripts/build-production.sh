#!/bin/bash

# TeamCache Manager Production Build Script
# Builds Docker images for production deployment

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🚀 TeamCache Manager Production Build${NC}"
echo ""

# Load .env file if it exists
if [ -f "$PROJECT_DIR/.env" ]; then
    echo -e "${BLUE}📋 Loading configuration from .env file...${NC}"
    # Export variables from .env file (ignore comments and empty lines)
    set -a
    source <(grep -v '^#' "$PROJECT_DIR/.env" | grep -v '^$')
    set +a
    echo -e "${GREEN}✅ Loaded .env file${NC}"
else
    echo -e "${YELLOW}⚠️  No .env file found, using environment variables${NC}"
fi

# Check for build-time requirements
echo -e "${BLUE}📋 Checking build requirements...${NC}"

# For frontend build, we need SERVER_HOST
if [ -z "${SERVER_HOST:-}" ]; then
    echo -e "${YELLOW}⚠️  SERVER_HOST not set. Using 'localhost' for build.${NC}"
    echo "   You can set this in .env or as environment variable"
    SERVER_HOST="localhost"
fi

# Check SSL configuration (default to true if not set)
SSL_ENABLED="${SSL_ENABLED:-true}"
if [ "$SSL_ENABLED" = "true" ]; then
    PROTOCOL="https"
    WS_PROTOCOL="wss"
else
    PROTOCOL="http"
    WS_PROTOCOL="ws"
fi

echo -e "${GREEN}✅ Build requirements satisfied${NC}"
echo "   SERVER_HOST: $SERVER_HOST"
echo "   SSL_ENABLED: $SSL_ENABLED"
echo "   API Protocol: $PROTOCOL"

echo ""
echo -e "${BLUE}🔨 Building Docker images for production...${NC}"

# Build backend with optimizations
echo ""
echo -e "${YELLOW}📦 Building backend...${NC}"
docker build \
    --target production \
    --tag tc-mgr-backend:latest \
    --tag tc-mgr-backend \
    --file "${PROJECT_DIR}/backend/Dockerfile" \
    --no-cache \
    "${PROJECT_DIR}/.."

# Build frontend with optimizations
echo ""
echo -e "${YELLOW}📦 Building frontend...${NC}"
docker build \
    --build-arg REACT_APP_API_URL="${PROTOCOL}://${SERVER_HOST}/api" \
    --build-arg REACT_APP_WS_URL="${WS_PROTOCOL}://${SERVER_HOST}" \
    --build-arg REACT_APP_LUCIDLINK_MOUNT_POINT="/media/lucidlink-1" \
    --build-arg REACT_APP_GRAFANA_URL="http://${SERVER_HOST}:3000" \
    --tag tc-mgr-frontend:latest \
    --tag tc-mgr-frontend \
    --file "${PROJECT_DIR}/frontend/Dockerfile.optimized" \
    --no-cache \
    "${PROJECT_DIR}/frontend"

# Build varnish-stats collector
echo ""
echo -e "${YELLOW}📦 Building varnish-stats collector...${NC}"
docker build \
    --tag tc-mgr-varnish-stats:latest \
    --tag tc-mgr-varnish-stats \
    --file "${PROJECT_DIR}/varnish-stats-collector/Dockerfile" \
    --no-cache \
    "${PROJECT_DIR}/varnish-stats-collector"

echo ""
echo -e "${GREEN}✅ All Docker images built successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Built Images:${NC}"
docker images | grep -E "^tc-mgr-" | head -4

echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Deploy the application:"
echo "   ./scripts/deploy-production.sh        # With nginx SSL"
echo "   ./scripts/deploy-production.sh caddy  # With Caddy auto-SSL"
echo "   ./scripts/deploy-production.sh none   # Without SSL (dev only)"
echo ""
echo -e "${GREEN}✨ Build complete!${NC}"