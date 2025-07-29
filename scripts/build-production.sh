#!/bin/bash

# TeamCache Manager Production Build Script
# Optimized build process for v1.7.0

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

echo -e "${GREEN}🚀 TeamCache Manager Production Build v1.7.0${NC}"
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

# Build timestamp
BUILD_TIME=$(date +%Y%m%d_%H%M%S)
BUILD_VERSION="1.7.0"

# Create build directory
BUILD_DIR="${PROJECT_DIR}/builds/${BUILD_TIME}"
mkdir -p "$BUILD_DIR"

echo -e "${BLUE}🔨 Building optimized Docker images...${NC}"

# Build backend with optimizations
echo -e "${YELLOW}Building backend...${NC}"
docker build \
    --target production \
    --build-arg BUILD_VERSION="$BUILD_VERSION" \
    --build-arg BUILD_TIME="$BUILD_TIME" \
    --tag teamcache-backend:${BUILD_VERSION} \
    --tag teamcache-backend:latest \
    --file "${PROJECT_DIR}/backend/Dockerfile" \
    --no-cache \
    "${PROJECT_DIR}/.."

# Build frontend with optimizations
echo -e "${YELLOW}Building frontend...${NC}"
docker build \
    --build-arg REACT_APP_API_URL="${PROTOCOL}://${SERVER_HOST}/api" \
    --build-arg REACT_APP_WS_URL="${WS_PROTOCOL}://${SERVER_HOST}" \
    --build-arg REACT_APP_LUCIDLINK_MOUNT_POINT="/media/lucidlink-1" \
    --build-arg REACT_APP_GRAFANA_URL="http://${SERVER_HOST}:3000" \
    --tag teamcache-frontend:${BUILD_VERSION} \
    --tag teamcache-frontend:latest \
    --file "${PROJECT_DIR}/frontend/Dockerfile.optimized" \
    --no-cache \
    "${PROJECT_DIR}/frontend"


echo -e "${GREEN}✅ Docker images built successfully${NC}"

# Export images for deployment
echo -e "${BLUE}📦 Exporting Docker images...${NC}"
docker save -o "${BUILD_DIR}/teamcache-backend-${BUILD_VERSION}.tar" teamcache-backend:${BUILD_VERSION}
docker save -o "${BUILD_DIR}/teamcache-frontend-${BUILD_VERSION}.tar" teamcache-frontend:${BUILD_VERSION}

# Create deployment package
echo -e "${BLUE}📦 Creating deployment package...${NC}"
cp "${PROJECT_DIR}/docker-compose.yml" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/docker-compose.prod.yml" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/docker-compose.production.yml" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/docker-compose.ssl.yml" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/docker-compose.caddy.yml" "${BUILD_DIR}/"
cp "${PROJECT_DIR}/docker-compose.package.yml" "${BUILD_DIR}/" 2>/dev/null || true
cp -r "${PROJECT_DIR}/scripts" "${BUILD_DIR}/"

# Copy schema files
mkdir -p "${BUILD_DIR}/schema"
for schema_file in "${PROJECT_DIR}/backend"/schema*.sql; do
    if [ -f "$schema_file" ]; then
        cp "$schema_file" "${BUILD_DIR}/schema/"
    fi
done

# Copy migrations if they exist
if [ -d "${PROJECT_DIR}/backend/migrations" ]; then
    cp -r "${PROJECT_DIR}/backend/migrations" "${BUILD_DIR}/"
fi

# Create necessary empty directories for volume mounts
mkdir -p "${BUILD_DIR}/backend"
mkdir -p "${BUILD_DIR}/frontend" 
mkdir -p "${BUILD_DIR}/varnish-stats-collector"
mkdir -p "${BUILD_DIR}/ssl"

# Copy schema files to backend directory (where docker-compose expects them)
cp "${BUILD_DIR}/schema"/*.sql "${BUILD_DIR}/backend/" 2>/dev/null || true

# Copy nginx configs if they exist
if [ -f "${PROJECT_DIR}/frontend/nginx.ssl.conf" ]; then
    cp "${PROJECT_DIR}/frontend/nginx.ssl.conf" "${BUILD_DIR}/frontend/"
fi

# Create deployment instructions
cat > "${BUILD_DIR}/DEPLOY.md" << EOF
# TeamCache Manager v${BUILD_VERSION} Deployment

Built on: ${BUILD_TIME}

## Package Contents

This is a self-contained deployment package that includes:
- Pre-built Docker images (teamcache-backend-${BUILD_VERSION}.tar, teamcache-frontend-${BUILD_VERSION}.tar)
- All configuration files (docker-compose.yml, etc.)
- Database schema files
- Deployment scripts
- SSL certificate generation tools

## Deployment Instructions

1. Extract this package to your deployment directory:
   \`\`\`bash
   cd /opt  # or your preferred location
   tar -xzf teamcache-${BUILD_VERSION}-*.tar.gz
   cd ${BUILD_TIME}
   \`\`\`

2. Load the Docker images:
   \`\`\`bash
   docker load -i teamcache-backend-${BUILD_VERSION}.tar
   docker load -i teamcache-frontend-${BUILD_VERSION}.tar
   \`\`\`

3. Create your production .env file:
   \`\`\`bash
   # Option 1: Generate new environment
   ./scripts/generate-production-env.sh
   
   # Option 2: Copy existing .env from your source
   cp /path/to/your/.env .
   \`\`\`

4. Verify configuration:
   \`\`\`bash
   ./scripts/verify-env.sh
   \`\`\`

5. Deploy the application:
   \`\`\`bash
   # IMPORTANT: Use --skip-build flag for package deployments
   
   # Deploy with nginx SSL (recommended for IP addresses)
   ./scripts/deploy-production.sh nginx --skip-build
   
   # Deploy with Caddy (automatic HTTPS for domain names)
   ./scripts/deploy-production.sh caddy --skip-build
   
   # Deploy without SSL (testing only)
   ./scripts/deploy-production.sh none --skip-build
   \`\`\`

The deployment script will automatically:
- Generate SSL certificates if needed (nginx mode)
- Initialize the database
- Create admin user
- Start all services
- Verify deployment health

## Post-Deployment

1. Verify health: https://yourdomain.com/api/health
2. Create additional users via Admin panel
3. Set up monitoring and backups
4. Configure log rotation

## Security Checklist

- [ ] Changed all default passwords
- [ ] SSL certificates installed
- [ ] Firewall configured (ports 80, 443, 3000 for Grafana)
- [ ] Backup schedule configured
- [ ] Monitoring alerts set up
EOF

# Compress deployment package
echo -e "${BLUE}🗜️  Compressing deployment package...${NC}"
cd "${PROJECT_DIR}/builds"
tar -czf "teamcache-${BUILD_VERSION}-${BUILD_TIME}.tar.gz" "${BUILD_TIME}/"

# Calculate package size
PACKAGE_SIZE=$(du -h "teamcache-${BUILD_VERSION}-${BUILD_TIME}.tar.gz" | cut -f1)

echo ""
echo -e "${GREEN}✅ Production build complete!${NC}"
echo ""
echo -e "${BLUE}📊 Build Summary:${NC}"
echo "   - Version: ${BUILD_VERSION}"
echo "   - Build ID: ${BUILD_TIME}"
echo "   - Package: ${PROJECT_DIR}/builds/teamcache-${BUILD_VERSION}-${BUILD_TIME}.tar.gz"
echo "   - Size: ${PACKAGE_SIZE}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo -e "${BLUE}Option 1: Deploy on this server${NC}"
echo "1. Stay in the project directory: cd $PROJECT_DIR"
echo "2. Run: docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo ""
echo -e "${BLUE}Option 2: Deploy on a different server${NC}"
echo "1. Copy the package to your production server:"
echo "   scp ${PROJECT_DIR}/builds/teamcache-${BUILD_VERSION}-${BUILD_TIME}.tar.gz user@server:/path/"
echo "2. On the production server, extract: tar -xzf teamcache-${BUILD_VERSION}-${BUILD_TIME}.tar.gz"
echo "3. Follow the DEPLOY.md instructions in the extracted directory"
echo ""
echo -e "${GREEN}✨ Build successful!${NC}"