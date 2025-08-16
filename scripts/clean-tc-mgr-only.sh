#!/bin/bash
# Clean TeamCache Manager deployment while preserving Varnish companion stack
# This script removes only tc-mgr components, keeping varnish, grafana, and prometheus intact

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        TeamCache Manager Selective Cleanup Script              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Services to preserve
echo -e "${GREEN}🛡️  Services to PRESERVE:${NC}"
echo "   ✓ teamcache-varnish"
echo "   ✓ grafana"
echo "   ✓ prometheus"
echo ""

# Services to remove
echo -e "${YELLOW}🗑️  Services to REMOVE:${NC}"
echo "   • All tc-mgr-* containers"
echo "   • All tc-mgr-* volumes"
echo "   • All tc-mgr-* and teamcache-* images"
echo "   • TeamCache Manager data directories"
echo ""

echo -e "${YELLOW}⚠️  WARNING: This will remove all TeamCache Manager data!${NC}"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Check if we're in the project root
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: This script must be run from the project root directory${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Starting cleanup...${NC}"

# Step 1: Stop and remove tc-mgr containers only
echo ""
echo "1. Stopping TeamCache Manager containers..."
docker ps -a --format "{{.Names}}" | grep "^tc-mgr-" | while read container; do
    echo "   Stopping $container..."
    docker stop "$container" 2>/dev/null || true
    docker rm "$container" 2>/dev/null || true
done

# Also try with docker compose (in case they're managed by compose)
docker compose down 2>/dev/null || true

echo ""
echo "2. Removing TeamCache Manager volumes..."
docker volume ls --format "{{.Name}}" | grep "tc-mgr" | while read volume; do
    echo "   Removing volume: $volume"
    docker volume rm "$volume" 2>/dev/null || true
done

# Also remove volumes that might have different naming patterns
docker volume ls --format "{{.Name}}" | grep -E "teamcache_|tc-manager" | while read volume; do
    # Skip if it contains the varnish container itself, grafana, or prometheus
    # BUT DO remove varnish_stats volume (contains stale cache data)
    if echo "$volume" | grep -q "varnish_stats"; then
        echo "   Removing stale varnish_stats volume: $volume"
        docker volume rm "$volume" 2>/dev/null || true
    elif ! echo "$volume" | grep -qE "varnish|grafana|prometheus"; then
        echo "   Removing volume: $volume"
        docker volume rm "$volume" 2>/dev/null || true
    fi
done

# Explicitly remove any varnish_stats volumes (they contain stale data)
echo "   Ensuring varnish_stats volumes are removed..."
docker volume rm tc-mgr_varnish_stats 2>/dev/null || true
docker volume rm varnish_stats 2>/dev/null || true

echo ""
echo "3. Removing TeamCache Manager images..."
# Remove tc-mgr images
docker images --format "{{.Repository}}:{{.Tag}}|{{.ID}}" | grep "tc-mgr" | while IFS='|' read -r name id; do
    echo "   Removing image: $name"
    docker rmi -f "$id" 2>/dev/null || true
done

# Remove teamcache images (but not teamcache-varnish)
docker images --format "{{.Repository}}:{{.Tag}}|{{.ID}}" | grep "teamcache" | grep -v "varnish" | while IFS='|' read -r name id; do
    echo "   Removing image: $name"
    docker rmi -f "$id" 2>/dev/null || true
done

# Remove sc-manager-greenfield images
docker images --format "{{.Repository}}:{{.Tag}}|{{.ID}}" | grep "sc-manager-greenfield" | while IFS='|' read -r name id; do
    echo "   Removing image: $name"
    docker rmi -f "$id" 2>/dev/null || true
done

echo ""
echo "4. Cleaning local data directories..."
# Remove only TeamCache Manager related data
rm -rf data/postgres 2>/dev/null || true
rm -rf data/elasticsearch 2>/dev/null || true
rm -rf data/redis 2>/dev/null || true
rm -rf data/previews 2>/dev/null || true
rm -rf backend/logs/ 2>/dev/null || true
rm -rf backend/node_modules/ 2>/dev/null || true
rm -rf frontend/node_modules/ 2>/dev/null || true
rm -rf frontend/build/ 2>/dev/null || true
echo "   ✓ Cleaned data directories"

echo ""
echo "5. Backing up environment files..."
timestamp=$(date +%Y%m%d_%H%M%S)
mkdir -p .env-backups

for file in .env .env.local .env.development.local .env.production.local; do
    if [ -f "$file" ]; then
        echo "   Backing up $file to .env-backups/${file}.${timestamp}"
        cp "$file" ".env-backups/${file}.${timestamp}"
    fi
done

echo ""
echo "6. Pruning unused Docker resources..."
docker image prune -f
docker container prune -f

echo ""
echo -e "${BLUE}Verification...${NC}"

# Check what's still running
echo ""
echo "Remaining containers:"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -E "varnish|grafana|prometheus" || echo "   None found"

echo ""
echo "TeamCache Manager containers (should be empty):"
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep "tc-mgr" || echo "   ✓ All removed"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Cleanup Complete!                                 ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "✅ TeamCache Manager components removed"
echo "✅ Varnish stack preserved"
echo "✅ Environment files backed up to .env-backups/"
echo ""
echo -e "${YELLOW}Next steps for re-deployment:${NC}"
echo "1. Extract your package: tar -xzf tc-mgr-*.tar.gz"
echo "2. Enter directory: cd [extracted_directory]"
echo "3. Run installer: ./install.sh"
echo ""
echo -e "${BLUE}Your preserved services:${NC}"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | head -1
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -E "varnish|grafana|prometheus" || true