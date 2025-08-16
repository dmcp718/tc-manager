#!/bin/bash
# Clean deployment test script for SiteCache Manager
# This script completely removes all Docker resources and tests a fresh deployment

set -e

echo "=== SiteCache Manager Clean Deployment Test ==="
echo ""
echo "⚠️  WARNING: This will remove ALL Docker resources for this project!"
echo "This includes:"
echo "  - All containers"
echo "  - All volumes (including database data)"
echo "  - All project images"
echo "  - All environment files"
echo "  - All generated data"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Check if we're in the project root
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: This script must be run from the project root directory"
    exit 1
fi

echo ""
echo "1. Stopping all containers..."
docker compose down 2>/dev/null || true
docker compose -f docker-compose.yml -f docker-compose.dev.yml down 2>/dev/null || true
docker compose -f docker-compose.yml -f docker-compose.prod.yml down 2>/dev/null || true

echo ""
echo "2. Removing all project volumes..."
docker compose down -v 2>/dev/null || true
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v 2>/dev/null || true

# List and remove any remaining project volumes
echo "   Removing specific project volumes..."
docker volume ls | grep tc-mgr | awk '{print $2}' | xargs -r docker volume rm 2>/dev/null || true

echo ""
echo "3. Removing all project images..."
# Remove images with project name
docker images | grep tc-mgr | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true
docker images | grep tc-manager | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true

echo ""
echo "4. Pruning Docker system..."
docker system prune -f
docker volume prune -f

echo ""
echo "5. Removing local data directories..."
rm -rf data/
rm -rf backend/logs/
rm -rf backend/node_modules/
rm -rf frontend/node_modules/
rm -rf frontend/build/

echo ""
echo "6. Backing up and removing environment files..."
# Backup existing env files with timestamp
timestamp=$(date +%Y%m%d_%H%M%S)
mkdir -p .env-backups

for file in .env .env.local .env.development.local .env.production.local; do
    if [ -f "$file" ]; then
        echo "   Backing up $file to .env-backups/${file}.${timestamp}"
        cp "$file" ".env-backups/${file}.${timestamp}"
        rm -f "$file"
    fi
done

echo ""
echo "7. Removing generated files..."
rm -f host-info.json
rm -f backend/host-info.json

echo ""
echo "8. Checking for any remaining Docker resources..."
remaining_containers=$(docker ps -a | grep -E "tc-mgr|tc-manager" | wc -l || echo "0")
remaining_images=$(docker images | grep -E "tc-mgr|tc-manager" | wc -l || echo "0")
remaining_volumes=$(docker volume ls | grep -E "tc-mgr|tc-manager" | wc -l || echo "0")

if [ "$remaining_containers" -gt 0 ] || [ "$remaining_images" -gt 0 ] || [ "$remaining_volumes" -gt 0 ]; then
    echo "   ⚠️  Found remaining resources:"
    [ "$remaining_containers" -gt 0 ] && echo "      - $remaining_containers containers"
    [ "$remaining_images" -gt 0 ] && echo "      - $remaining_images images"
    [ "$remaining_volumes" -gt 0 ] && echo "      - $remaining_volumes volumes"
    echo "   Run 'docker system prune -a' to remove all unused resources"
else
    echo "   ✓ All clean!"
fi

echo ""
echo "=== Cleanup Complete ==="
echo ""
echo "Now starting fresh deployment test..."
echo ""

# Run the setup script
if [ -f "./scripts/setup-development.sh" ]; then
    echo "9. Running setup script..."
    ./scripts/setup-development.sh
    
    echo ""
    echo "=== Clean Deployment Test Complete ==="
    echo ""
    echo "Next steps:"
    echo "1. Edit .env file with your configuration"
    echo "2. Start the development environment: npm run dev"
    echo "3. Verify all features work correctly"
    echo ""
    echo "Your environment file backups are saved in: .env-backups/"
else
    echo "Error: setup-development.sh not found!"
    echo "Please run './scripts/setup-development.sh' manually"
    exit 1
fi