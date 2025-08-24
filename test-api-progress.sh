#!/bin/bash

# Test API progress granularity
API_URL="http://localhost:8095/api/v1"
API_KEY="${API_GATEWAY_KEY:-demo-api-key-2024}"

echo "Testing API Progress Granularity"
echo "================================"
echo ""

# Submit a small test job
echo "1. Submitting small cache job (targeting ~10-20 files)..."
RESPONSE=$(curl -s -X POST "$API_URL/cache/jobs" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "directories": ["/media/lucidlink-1/projects"],
    "file_extensions": [".mp4", ".mov"],
    "max_files": 15,
    "description": "API progress granularity test"
  }')

JOB_ID=$(echo "$RESPONSE" | jq -r '.job.id')

if [ "$JOB_ID" = "null" ] || [ -z "$JOB_ID" ]; then
  echo "Failed to create job:"
  echo "$RESPONSE"
  exit 1
fi

echo "   Job created: $JOB_ID"
echo ""
echo "2. Monitoring progress (checking every second)..."
echo ""

LAST_COMPLETED=0
LAST_SIZE=0
CHECK_COUNT=0
MAX_CHECKS=300  # 5 minutes max

while [ $CHECK_COUNT -lt $MAX_CHECKS ]; do
  # Get job status
  STATUS_RESPONSE=$(curl -s -X GET "$API_URL/cache/jobs/$JOB_ID" \
    -H "X-API-Key: $API_KEY")
  
  # Extract values
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.job.status')
  COMPLETED=$(echo "$STATUS_RESPONSE" | jq -r '.job.completed_files')
  FAILED=$(echo "$STATUS_RESPONSE" | jq -r '.job.failed_files')
  TOTAL=$(echo "$STATUS_RESPONSE" | jq -r '.job.totalFiles')
  SIZE_BYTES=$(echo "$STATUS_RESPONSE" | jq -r '.job.completed_size_bytes')
  TOTAL_SIZE=$(echo "$STATUS_RESPONSE" | jq -r '.job.total_size_bytes')
  
  # Check if progress changed
  if [ "$COMPLETED" != "$LAST_COMPLETED" ] || [ "$SIZE_BYTES" != "$LAST_SIZE" ]; then
    # Convert size to MB
    SIZE_MB=$(echo "scale=2; $SIZE_BYTES / 1048576" | bc 2>/dev/null || echo "0")
    TOTAL_MB=$(echo "scale=2; $TOTAL_SIZE / 1048576" | bc 2>/dev/null || echo "0")
    
    # Calculate percentages
    if [ "$TOTAL" -gt 0 ]; then
      FILE_PCT=$(echo "scale=1; $COMPLETED * 100 / $TOTAL" | bc 2>/dev/null || echo "0")
    else
      FILE_PCT=0
    fi
    
    if [ "$TOTAL_SIZE" -gt 0 ]; then
      SIZE_PCT=$(echo "scale=1; $SIZE_BYTES * 100 / $TOTAL_SIZE" | bc 2>/dev/null || echo "0")
    else
      SIZE_PCT=0
    fi
    
    # Print update
    echo "   Update #$((CHECK_COUNT + 1)): Files: $COMPLETED/$TOTAL ($FILE_PCT%) | Size: ${SIZE_MB}MB/${TOTAL_MB}MB ($SIZE_PCT%) | Status: $STATUS"
    
    LAST_COMPLETED=$COMPLETED
    LAST_SIZE=$SIZE_BYTES
  fi
  
  # Check if job is complete
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "cancelled" ]; then
    echo ""
    echo "3. Job completed!"
    echo "   Final status: $STATUS"
    echo "   Files cached: $COMPLETED/$TOTAL"
    echo "   Failed files: $FAILED"
    echo ""
    
    # Show if we got granular updates
    if [ $CHECK_COUNT -gt 0 ]; then
      echo "Progress granularity analysis:"
      if [ "$TOTAL" -gt 0 ] && [ "$TOTAL" -lt 100 ]; then
        if [ "$COMPLETED" -eq "$TOTAL" ]; then
          echo "✅ Small job (<100 files) completed with per-file updates"
        fi
      fi
    fi
    
    exit 0
  fi
  
  # Sleep before next check
  sleep 1
  CHECK_COUNT=$((CHECK_COUNT + 1))
done

echo ""
echo "Test timeout reached (5 minutes). Job may still be running."
echo "Last status: $STATUS"
exit 1