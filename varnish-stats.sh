#!/bin/bash

# Script to fetch Varnish cache statistics and write to JSON file
# This runs on the host and writes to a file that the backend container can read

STATS_FILE="/tmp/varnish-stats.json"
CONTAINER_NAME="sitecache-varnish-1"

while true; do
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
            echo "Updated Varnish storage stats: $(($BYTES_USED / 1024 / 1024 / 1024)) GB used, $(($BYTES_UNUSED / 1024 / 1024 / 1024)) GB unused ($USAGE_PERCENTAGE%)"
        fi
    fi
    
    # Wait 30 seconds before next update
    sleep 30
done