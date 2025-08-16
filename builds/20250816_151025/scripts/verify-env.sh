#!/bin/bash

# Verify environment configuration for TeamCache Manager v1.7.0
set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔍 TeamCache Manager Environment Verification${NC}"
echo ""

# Check if .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo -e "${RED}❌ ERROR: .env file not found!${NC}"
    echo ""
    echo "Please create it using one of these methods:"
    echo "1. ./scripts/generate-production-env.sh (recommended)"
    echo "2. cp .env.production .env && nano .env"
    exit 1
fi

echo -e "${GREEN}✅ .env file found${NC}"

# Required variables
REQUIRED_VARS=(
    "SERVER_HOST"
    "POSTGRES_PASSWORD"
    "JWT_SECRET"
    "ADMIN_PASSWORD"
    "LUCIDLINK_FILESPACE"
    "LUCIDLINK_USER"
    "LUCIDLINK_PASSWORD"
    "DB_NAME"
    "DB_USER"
)

# Check for missing or placeholder values
ERRORS=0
WARNINGS=0

echo ""
echo -e "${YELLOW}Checking required environment variables...${NC}"
echo ""

for var in "${REQUIRED_VARS[@]}"; do
    # Get the value
    VALUE=$(grep "^${var}=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d'=' -f2- || echo "")
    
    if [ -z "$VALUE" ]; then
        echo -e "${RED}❌ $var is not set${NC}"
        ERRORS=$((ERRORS + 1))
    elif [[ "$VALUE" =~ (GENERATE_|CHANGE_ME|your_|YOUR_|placeholder|example) ]]; then
        echo -e "${RED}❌ $var contains placeholder value: $VALUE${NC}"
        ERRORS=$((ERRORS + 1))
    elif [ "$var" = "LUCIDLINK_PASSWORD" ] || [ "$var" = "ADMIN_PASSWORD" ] || [ "$var" = "POSTGRES_PASSWORD" ]; then
        # Don't show password values
        echo -e "${GREEN}✅ $var is set (hidden)${NC}"
    else
        echo -e "${GREEN}✅ $var = $VALUE${NC}"
    fi
done

# Check for optional but recommended variables
echo ""
echo -e "${YELLOW}Checking optional configuration...${NC}"
echo ""

OPTIONAL_VARS=(
    "GRAFANA_URL"
    "CACHE_WORKER_COUNT"
    "LOG_LEVEL"
    "DOMAIN_NAME"
)

for var in "${OPTIONAL_VARS[@]}"; do
    VALUE=$(grep "^${var}=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d'=' -f2- || echo "")
    
    if [ -z "$VALUE" ]; then
        echo -e "${YELLOW}⚠️  $var is not set (using default)${NC}"
        WARNINGS=$((WARNINGS + 1))
    else
        echo -e "${GREEN}✅ $var = $VALUE${NC}"
    fi
done

# Check file permissions
echo ""
echo -e "${YELLOW}Checking file permissions...${NC}"
PERMS=$(stat -c %a "$PROJECT_DIR/.env" 2>/dev/null || stat -f %Lp "$PROJECT_DIR/.env" 2>/dev/null)
if [ "$PERMS" != "600" ]; then
    echo -e "${YELLOW}⚠️  .env permissions are $PERMS (should be 600 for security)${NC}"
    echo "   Fix with: chmod 600 .env"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ .env permissions are secure (600)${NC}"
fi

# Test Docker Compose can read the file
echo ""
echo -e "${YELLOW}Testing Docker Compose integration...${NC}"
if docker compose config > /dev/null 2>&1; then
    # Check if key values are being read
    JWT_CHECK=$(docker compose config | grep -c "JWT_SECRET: " || true)
    if [ "$JWT_CHECK" -gt 0 ]; then
        echo -e "${GREEN}✅ Docker Compose can read .env file${NC}"
    else
        echo -e "${RED}❌ Docker Compose is not reading .env values correctly${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}❌ Docker Compose configuration error${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✅ Environment configuration is complete and valid!${NC}"
        echo ""
        echo "You can now deploy with:"
        echo "docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
    else
        echo -e "${GREEN}✅ Environment configuration is valid${NC}"
        echo -e "${YELLOW}⚠️  $WARNINGS warnings found (optional items)${NC}"
        echo ""
        echo "You can deploy, but consider reviewing the warnings above."
    fi
else
    echo -e "${RED}❌ Environment configuration has $ERRORS errors!${NC}"
    echo ""
    echo "Please fix the errors above before deploying."
    echo "You can regenerate your .env file with:"
    echo "./scripts/generate-production-env.sh"
    exit 1
fi

echo ""
echo -e "${GREEN}💡 Tip: Save your admin password somewhere safe!${NC}"
ADMIN_PASS=$(grep "^ADMIN_PASSWORD=" "$PROJECT_DIR/.env" 2>/dev/null | cut -d'=' -f2- || echo "")
if [ -n "$ADMIN_PASS" ] && ! [[ "$ADMIN_PASS" =~ (GENERATE_|CHANGE_ME) ]]; then
    echo "   Username: admin"
    echo "   Password: $ADMIN_PASS"
fi