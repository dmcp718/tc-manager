#!/bin/bash

# Varnish Stats Collector for Docker Compose deployment
# This service collects Varnish cache statistics and writes them to a shared volume

STATS_FILE="/data/varnish-stats.json"
CONTAINER_NAME="${VARNISH_CONTAINER_NAME:-sitecache-varnish-1}"
UPDATE_INTERVAL="${UPDATE_INTERVAL:-30}"

echo "Starting Varnish Stats Collector..."
echo "Container: $CONTAINER_NAME"
echo "Update interval: ${UPDATE_INTERVAL}s"
echo "Stats file: $STATS_FILE"

# Function to collect and write stats
collect_stats() {
    # Get varnish storage stats
    VARNISH_OUTPUT=$(docker exec $CONTAINER_NAME varnishstat -1 -f '*.g_bytes_used*' -f '*.g_bytes_unused*' 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Parse the output for storage statistics
        BYTES_USED=$(echo "$VARNISH_OUTPUT" | grep "MSE4_STORE.*\.g_bytes_used[[:space:]]" | awk '{print $2}')
        BYTES_UNUSED=$(echo "$VARNISH_OUTPUT" | grep "MSE4_STORE.*\.g_bytes_unused[[:space:]]" | awk '{print $2}')
        
        if [ ! -z "$BYTES_USED" ] && [ ! -z "$BYTES_UNUSED" ]; then
            TOTAL_SPACE=$((BYTES_USED + BYTES_UNUSED))
            # Calculate percentage using shell arithmetic (multiplied by 100 for precision)
            USAGE_PERCENTAGE_INT=$((BYTES_USED * 10000 / TOTAL_SPACE))
            USAGE_PERCENTAGE=$((USAGE_PERCENTAGE_INT / 100)).$((USAGE_PERCENTAGE_INT % 100))
            
            # Create JSON output
            cat > "$STATS_FILE" << EOF
{
  "bytesUsed": $BYTES_USED,
  "bytesAvailable": $BYTES_UNUSED,
  "totalSpace": $TOTAL_SPACE,
  "usagePercentage": $USAGE_PERCENTAGE,
  "lastUpdated": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
}
EOF
            echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] Updated stats: $(($BYTES_USED / 1024 / 1024 / 1024)) GB used, $(($BYTES_UNUSED / 1024 / 1024 / 1024)) GB unused ($USAGE_PERCENTAGE%)"
        else
            echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] ERROR: Failed to parse varnishstat output"
        fi
    else
        echo "[$(date -u +%Y-%m-%dT%H:%M:%S)] ERROR: Failed to execute varnishstat command"
    fi
}

# Main loop
while true; do
    collect_stats
    sleep $UPDATE_INTERVAL
done