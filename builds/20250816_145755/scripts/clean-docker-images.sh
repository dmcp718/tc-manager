#!/bin/bash

# Clean Docker images except for specified ones
set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🧹 Docker Image Cleanup${NC}"
echo ""

# Images to keep
KEEP_IMAGES=(
    "grafana/grafana-enterprise:latest"
    "quay.io/varnish-software/varnish-plus:6.0.13r15"
    "prom/prometheus:v2.53.0"
)

echo -e "${YELLOW}Images to keep:${NC}"
for img in "${KEEP_IMAGES[@]}"; do
    echo "  ✓ $img"
done
echo ""

# Get all image IDs
ALL_IMAGES=$(docker images --format "{{.Repository}}:{{.Tag}}|{{.ID}}" | grep -v "<none>")

# Count images
TOTAL_BEFORE=$(docker images -q | wc -l | tr -d ' ')
echo -e "${YELLOW}Total images before cleanup: $TOTAL_BEFORE${NC}"

# Build regex pattern for images to keep
KEEP_PATTERN=""
for img in "${KEEP_IMAGES[@]}"; do
    if [ -z "$KEEP_PATTERN" ]; then
        KEEP_PATTERN="$img"
    else
        KEEP_PATTERN="$KEEP_PATTERN|$img"
    fi
done

# Find images to remove
IMAGES_TO_REMOVE=""
while IFS='|' read -r image_name image_id; do
    # Check if this image should be kept
    if ! echo "$image_name" | grep -qE "^($KEEP_PATTERN)$"; then
        IMAGES_TO_REMOVE="$IMAGES_TO_REMOVE $image_id"
    fi
done <<< "$ALL_IMAGES"

# Remove the images
if [ -n "$IMAGES_TO_REMOVE" ]; then
    echo -e "${YELLOW}Removing Docker images...${NC}"
    for img_id in $IMAGES_TO_REMOVE; do
        echo -n "  Removing $img_id... "
        if docker rmi -f "$img_id" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗ (in use or already removed)${NC}"
        fi
    done
else
    echo -e "${GREEN}No images to remove!${NC}"
fi

# Clean up dangling images
echo ""
echo -e "${YELLOW}Cleaning up dangling images...${NC}"
docker image prune -f

# Show results
echo ""
TOTAL_AFTER=$(docker images -q | wc -l | tr -d ' ')
REMOVED=$((TOTAL_BEFORE - TOTAL_AFTER))

echo -e "${GREEN}✅ Cleanup complete!${NC}"
echo "   Images before: $TOTAL_BEFORE"
echo "   Images after: $TOTAL_AFTER"
echo "   Images removed: $REMOVED"
echo ""

# Show remaining images
echo -e "${YELLOW}Remaining images:${NC}"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}"