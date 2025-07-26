#!/bin/bash

# TeamCache Manager Production Deployment Script
# This script handles the complete deployment process including database initialization

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
SSL_MODE="${1:-none}"
SKIP_BUILD=false
SKIP_DB_INIT=false

# Parse command line arguments
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-db-init)
            SKIP_DB_INIT=true
            shift
            ;;
        --help)
            echo "Usage: $0 [ssl-mode] [options]"
            echo ""
            echo "SSL modes:"
            echo "  none       No SSL (default)"
            echo "  nginx      Use nginx with SSL certificates"
            echo "  caddy      Use Caddy with automatic HTTPS"
            echo ""
            echo "Options:"
            echo "  --skip-build    Skip building Docker images"
            echo "  --skip-db-init  Skip database initialization"
            echo "  --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./deploy-production.sh              # Deploy without SSL"
            echo "  ./deploy-production.sh nginx        # Deploy with nginx SSL"
            echo "  ./deploy-production.sh caddy        # Deploy with Caddy auto-SSL"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}🚀 TeamCache Manager Production Deployment v1.7.0${NC}"
echo ""

# Change to project directory
cd "$PROJECT_DIR"

# Load environment to get SERVER_HOST
if [ -f ".env" ]; then
    source <(grep -v '^#' .env | grep -v '^$') 2>/dev/null || true
fi

# Determine URLs based on SSL mode
if [ "$SSL_MODE" = "none" ]; then
    DEPLOYMENT_URL="http://${SERVER_HOST:-localhost}:8090"
else
    DEPLOYMENT_URL="https://${SERVER_HOST:-localhost}"
fi

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🚀 TeamCache Manager Production Deployment${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📍 Your TeamCache Manager will be accessible at:${NC}"
echo -e "${YELLOW}   ${DEPLOYMENT_URL}${NC}"
echo ""

# Step 1: Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check for .env file
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "   Please create it using: ./scripts/generate-production-env.sh"
    exit 1
fi

# Verify environment
echo -n "   Verifying environment configuration... "
if ./scripts/verify-env.sh >/dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
    echo "   Please fix environment issues before continuing"
    ./scripts/verify-env.sh
    exit 1
fi

# Check Docker
echo -n "   Checking Docker... "
if docker compose version >/dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Docker Compose not found${NC}"
    exit 1
fi

# Step 2: Build images (if needed)
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo -e "${BLUE}🔨 Building Docker images...${NC}"
    if ./scripts/build-production.sh; then
        echo -e "${GREEN}✅ Images built successfully${NC}"
    else
        echo -e "${RED}❌ Build failed${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${YELLOW}⚠️  Skipping Docker image build${NC}"
fi

# Step 3: Stop any existing deployment
echo ""
echo -e "${BLUE}🛑 Stopping existing services...${NC}"
docker compose down --remove-orphans 2>/dev/null || true

# Step 4: Determine compose files to use
COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.production.yml"

case $SSL_MODE in
    nginx)
        COMPOSE_CMD="$COMPOSE_CMD -f docker-compose.ssl.yml"
        echo -e "${BLUE}🔐 Using nginx SSL configuration${NC}"
        ;;
    caddy)
        COMPOSE_CMD="$COMPOSE_CMD -f docker-compose.caddy.yml"
        echo -e "${BLUE}🔐 Using Caddy auto-SSL configuration${NC}"
        ;;
    none)
        echo -e "${YELLOW}⚠️  Deploying without SSL${NC}"
        ;;
    *)
        echo -e "${RED}❌ Invalid SSL mode: $SSL_MODE${NC}"
        exit 1
        ;;
esac

# Step 5: Start core services
echo ""
echo -e "${BLUE}🚀 Starting core services...${NC}"

# Start PostgreSQL first
echo -n "   Starting PostgreSQL... "
$COMPOSE_CMD up -d postgres
echo -e "${GREEN}✅${NC}"

# Wait for PostgreSQL to be ready
echo -n "   Waiting for PostgreSQL to be ready... "
RETRIES=30
# Load POSTGRES_USER from environment
source <(grep -v '^#' .env | grep -v '^$')
while [ $RETRIES -gt 0 ]; do
    if $COMPOSE_CMD exec -T postgres pg_isready -U "${POSTGRES_USER:-teamcache_user}" >/dev/null 2>&1; then
        echo -e "${GREEN}✅${NC}"
        break
    fi
    sleep 1
    RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
    echo -e "${RED}❌ PostgreSQL failed to start${NC}"
    $COMPOSE_CMD logs postgres
    exit 1
fi

# Step 6: Initialize database (if needed)
if [ "$SKIP_DB_INIT" = false ]; then
    echo ""
    echo -e "${BLUE}🗄️  Initializing database...${NC}"
    if ./scripts/init-database.sh; then
        echo -e "${GREEN}✅ Database initialized${NC}"
    else
        echo -e "${RED}❌ Database initialization failed${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${YELLOW}⚠️  Skipping database initialization${NC}"
fi

# Step 7: Start all services
echo ""
echo -e "${BLUE}🚀 Starting all services...${NC}"
$COMPOSE_CMD up -d

# Step 8: Wait for services to be healthy
echo ""
echo -e "${BLUE}⏳ Waiting for services to be healthy...${NC}"

# Function to check service health
check_service_health() {
    local service=$1
    local max_wait=${2:-60}
    local elapsed=0
    
    echo -n "   Checking $service... "
    while [ $elapsed -lt $max_wait ]; do
        if $COMPOSE_CMD ps $service 2>/dev/null | grep -q "healthy\|running"; then
            echo -e "${GREEN}✅${NC}"
            return 0
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done
    echo -e "${RED}❌ Timeout${NC}"
    return 1
}

# Check each service
check_service_health postgres
check_service_health backend
check_service_health frontend
check_service_health elasticsearch 120  # Elasticsearch takes longer
check_service_health redis

# Step 9: Verify deployment
echo ""
echo -e "${BLUE}🔍 Verifying deployment...${NC}"

# Load environment for testing
source <(grep -v '^#' .env | grep -v '^$')

# Determine URLs based on configuration
if [ "$SSL_MODE" = "none" ]; then
    FRONTEND_URL="http://${SERVER_HOST:-localhost}:8090"
    API_URL="http://${SERVER_HOST:-localhost}:3001"
    WS_URL="ws://${SERVER_HOST:-localhost}:3002"
else
    FRONTEND_URL="https://${SERVER_HOST}"
    API_URL="https://${SERVER_HOST}:3001"
    WS_URL="wss://${SERVER_HOST}:3002"
fi

echo -n "   Testing frontend ($FRONTEND_URL)... "
if curl -f -s -o /dev/null "$FRONTEND_URL"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${YELLOW}⚠️  May need more time to start${NC}"
fi

echo -n "   Testing backend API ($API_URL/health)... "
if curl -f -s "$API_URL/health" | grep -q "healthy"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

# Step 10: Show deployment summary
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🌐 ACCESS YOUR TEAMCACHE MANAGER HERE:${NC}"
echo -e "${GREEN}   ${FRONTEND_URL}${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📊 Deployment Summary:${NC}"
echo "   Environment: Production v1.7.0"
echo "   SSL Mode: $SSL_MODE"
echo "   Frontend URL: $FRONTEND_URL"
echo "   Backend API: $API_URL"
echo "   WebSocket: $WS_URL"
if [ -n "${GRAFANA_URL:-}" ]; then
    echo "   Grafana: ${GRAFANA_URL}"
fi

echo ""
echo -e "${BLUE}📋 Running Services:${NC}"
$COMPOSE_CMD ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo -e "${BLUE}🔐 Default Credentials:${NC}"
echo "   Username: admin"
echo "   Password: (from your .env file)"

echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "1. Run smoke tests: ./scripts/smoke-test.sh"
echo "2. Access the web interface at: $FRONTEND_URL"
echo "3. Monitor logs: docker compose logs -f"
echo "4. Set up backups: crontab -e (add backup script)"

if [ "$SSL_MODE" = "none" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Warning: Running without SSL!${NC}"
    echo "   For production use, deploy with SSL:"
    echo "   ./deploy-production.sh nginx"
fi

echo ""
echo -e "${GREEN}✨ TeamCache Manager is ready!${NC}"