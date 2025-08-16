#!/bin/bash

# TeamCache Manager Database Initialization Script
# This script initializes the database schema for production deployment

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

echo -e "${GREEN}🗄️  TeamCache Manager Database Initialization${NC}"
echo ""

# Check if running from project directory
if [ ! -f "$PROJECT_DIR/docker-compose.yml" ]; then
    echo -e "${RED}❌ Error: Not in TeamCache Manager project directory${NC}"
    echo "   Please run this script from the project root"
    exit 1
fi

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    source <(grep -v '^#' "$PROJECT_DIR/.env" | grep -v '^$')
else
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "   Please create .env file first using generate-production-env.sh"
    exit 1
fi

# Check if postgres is running
echo -e "${BLUE}📋 Checking PostgreSQL status...${NC}"
if ! docker compose ps postgres 2>/dev/null | grep -E "(running|Up)" >/dev/null; then
    echo -e "${RED}❌ Error: PostgreSQL container is not running${NC}"
    echo "   Please start the containers first with: docker compose up -d postgres"
    exit 1
fi

# Wait for PostgreSQL to be ready
echo -e "${BLUE}⏳ Waiting for PostgreSQL to be ready...${NC}"
RETRIES=30
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" &>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        echo -e "${RED}❌ PostgreSQL failed to become ready${NC}"
        exit 1
    fi
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}Ready!${NC}"

# Check if database already has tables
echo -e "${BLUE}📋 Checking existing database state...${NC}"
TABLE_COUNT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs || echo "0")

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: Database already contains $TABLE_COUNT tables${NC}"
    
    # Check if running in non-interactive mode
    if [ -t 0 ]; then
        # Interactive mode - ask user
        read -p "Do you want to reinitialize the database? This will DELETE ALL DATA! (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}⚠️  Skipping database initialization${NC}"
            exit 0
        fi
    else
        # Non-interactive mode - check if users table exists
        USERS_EXISTS=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users');" 2>/dev/null | xargs || echo "f")
        if [ "$USERS_EXISTS" = "t" ]; then
            echo -e "${GREEN}✅ Database already initialized (users table exists)${NC}"
            exit 0
        fi
        echo -e "${YELLOW}⚠️  Users table missing, proceeding with initialization...${NC}"
    fi
    
    echo -e "${RED}🗑️  Dropping all existing tables...${NC}"
    docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" << EOF
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO "${DB_USER:-teamcache_user}";
EOF
fi

# Initialize database schema
echo -e "${BLUE}🔨 Initializing database schema...${NC}"

# Apply main schema
echo -n "   Applying main schema... "
if docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" < "$PROJECT_DIR/backend/schema.sql" 2>/dev/null; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
    exit 1
fi

# Apply users schema
echo -n "   Applying users schema... "
if docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" < "$PROJECT_DIR/backend/schema-users.sql" 2>/dev/null; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
    exit 1
fi

# Apply profiles schema
echo -n "   Applying profiles schema... "
if docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" < "$PROJECT_DIR/backend/schema-profiles.sql" 2>/dev/null; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
    exit 1
fi

# Apply direct links schema
echo -n "   Applying direct links schema... "
if docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" < "$PROJECT_DIR/backend/schema-direct-links.sql" 2>/dev/null; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
    exit 1
fi

# Apply stats schema if it exists
if [ -f "$PROJECT_DIR/backend/schema-stats.sql" ]; then
    echo -n "   Applying stats schema... "
    if docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" < "$PROJECT_DIR/backend/schema-stats.sql" 2>/dev/null; then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${RED}❌ Failed${NC}"
        exit 1
    fi
fi

# Apply elasticsearch schema if it exists
if [ -f "$PROJECT_DIR/backend/schema-elasticsearch.sql" ]; then
    echo -n "   Applying elasticsearch schema... "
    if docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" < "$PROJECT_DIR/backend/schema-elasticsearch.sql" 2>/dev/null; then
        echo -e "${GREEN}✅${NC}"
    else
        echo -e "${RED}❌ Failed${NC}"
        exit 1
    fi
fi

# Apply video preview schema
echo -n "   Applying video preview schema... "
if docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" < "$PROJECT_DIR/backend/schema-video-preview.sql" 2>/dev/null; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ Failed${NC}"
    exit 1
fi

# Check if backend is running, if not start it temporarily
echo -e "${BLUE}👤 Preparing to create admin user...${NC}"
BACKEND_WAS_RUNNING=true
if ! docker compose ps backend 2>/dev/null | grep -q "Up\|running"; then
    echo -n "   Starting backend temporarily for password hashing... "
    BACKEND_WAS_RUNNING=false
    docker compose up -d backend >/dev/null 2>&1
    # Wait for backend to be ready
    RETRIES=30
    while [ $RETRIES -gt 0 ]; do
        if docker compose exec -T backend node -e "console.log('ready')" >/dev/null 2>&1; then
            echo -e "${GREEN}✅${NC}"
            break
        fi
        sleep 1
        RETRIES=$((RETRIES - 1))
    done
    if [ $RETRIES -eq 0 ]; then
        echo -e "${RED}❌ Backend failed to start${NC}"
        exit 1
    fi
fi

# Create default admin user
echo -e "${BLUE}👤 Creating default admin user...${NC}"

# Hash the admin password using Node.js in the backend container
ADMIN_HASH=$(docker compose exec -T backend node -e "
const bcrypt = require('bcrypt');
const password = process.env.ADMIN_PASSWORD || 'admin123';
console.log(bcrypt.hashSync(password, 10));
" 2>/dev/null | tr -d '\r\n')

if [ -z "$ADMIN_HASH" ]; then
    echo -e "${RED}❌ Failed to hash admin password${NC}"
    # Stop backend if we started it
    if [ "$BACKEND_WAS_RUNNING" = false ]; then
        docker compose stop backend >/dev/null 2>&1
    fi
    exit 1
fi

# Insert admin user
docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" << EOF
INSERT INTO users (username, password_hash, email, role, created_at) 
VALUES ('admin', '$ADMIN_HASH', 'admin@teamcache.local', 'admin', NOW())
ON CONFLICT (username) DO UPDATE 
SET password_hash = '$ADMIN_HASH', updated_at = NOW();
EOF

echo -e "${GREEN}✅ Admin user created/updated${NC}"

# Cache profiles are already created by schema-profiles.sql
echo -e "${GREEN}✅ Default cache profiles created by schema${NC}"

# Verify database initialization
echo -e "${BLUE}🔍 Verifying database initialization...${NC}"
TABLE_COUNT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
USER_COUNT=$(docker compose exec -T postgres psql -U "${POSTGRES_USER:-teamcache_user}" -d "${POSTGRES_DB:-teamcache_db}" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs || echo "0")

echo "   Tables created: $TABLE_COUNT"
echo "   Users created: $USER_COUNT"

if [ "$TABLE_COUNT" -gt 0 ] && [ "$USER_COUNT" -gt 0 ]; then
    # Stop backend if we started it temporarily
    if [ "$BACKEND_WAS_RUNNING" = false ]; then
        echo ""
        echo -n "   Stopping temporary backend... "
        docker compose stop backend >/dev/null 2>&1
        echo -e "${GREEN}✅${NC}"
    fi
    
    echo ""
    echo -e "${GREEN}✅ Database initialization complete!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "1. Restart the backend service: docker compose restart backend"
    echo "2. Run smoke tests: ./scripts/smoke-test.sh"
    exit 0
else
    echo -e "${RED}❌ Database initialization may have failed${NC}"
    # Stop backend if we started it
    if [ "$BACKEND_WAS_RUNNING" = false ]; then
        docker compose stop backend >/dev/null 2>&1
    fi
    exit 1
fi