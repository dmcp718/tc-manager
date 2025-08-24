#!/bin/bash

# TeamCache Manager API Gateway Test Script
# Tests all API endpoints with sample data

set -e

# Configuration
API_URL="${API_URL:-http://localhost:8095}"
API_KEY="${API_KEY:-demo-api-key-2024}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}TeamCache Manager API Gateway Test Script${NC}"
echo "API URL: $API_URL"
echo ""

# Function to make API call and display result
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -e "${YELLOW}Testing: $description${NC}"
    echo "Method: $method"
    echo "Endpoint: $endpoint"
    
    if [ -n "$data" ]; then
        echo "Data: $data"
        response=$(curl -s -X $method "$API_URL$endpoint" \
            -H "X-API-Key: $API_KEY" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -X $method "$API_URL$endpoint" \
            -H "X-API-Key: $API_KEY")
    fi
    
    echo "Response:"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
    echo ""
    
    # Extract job ID if present for later tests
    if echo "$response" | grep -q '"jobId"'; then
        JOB_ID=$(echo "$response" | jq -r '.jobId')
        echo -e "${GREEN}Job ID: $JOB_ID${NC}"
    fi
    
    echo "---"
    echo ""
}

# Test 1: Health check (no auth required)
echo -e "${BLUE}Test 1: Health Check${NC}"
curl -s "$API_URL/api/v1/health" | jq '.'
echo ""
echo "---"
echo ""

# Test 2: Create job with relative paths (recommended)
api_call "POST" "/api/v1/cache/jobs" '{
    "files": [
        "test/video1.mp4",
        "test/video2.mov",
        "test/image.jpg"
    ]
}' "Create job with relative paths"

# Save first job ID
FIRST_JOB_ID=$JOB_ID

# Test 3: Create job with directories (relative paths)
api_call "POST" "/api/v1/cache/jobs" '{
    "directories": [
        "projects/project1",
        "projects/project2"
    ],
    "recursive": true
}' "Create job with directories (relative paths)"

# Test 4: Create job with macOS absolute paths (auto-normalized)
api_call "POST" "/api/v1/cache/jobs" '{
    "files": [
        "/Volumes/dmpfs/tc-east-1/Transcode_demo/source_01/video.mp4"
    ],
    "directories": [
        "/Volumes/dmpfs/tc-east-1/Transcode_demo/source_01/Farm"
    ],
    "recursive": true
}' "Create job with macOS absolute paths"

# Test 5: Create job with Windows paths (auto-normalized)
api_call "POST" "/api/v1/cache/jobs" '{
    "files": [
        "C:\\dmpfs\\tc-east-1\\Projects\\2024\\render.exr"
    ],
    "directories": [
        "C:\\dmpfs\\tc-east-1\\Projects\\2024\\Assets"
    ],
    "recursive": false
}' "Create job with Windows paths"

# Test 6: Get job status
if [ -n "$FIRST_JOB_ID" ]; then
    api_call "GET" "/api/v1/cache/jobs/$FIRST_JOB_ID" "" "Get job status"
fi

# Test 7: List jobs
api_call "GET" "/api/v1/cache/jobs?limit=5" "" "List recent jobs"

# Test 8: List pending jobs only
api_call "GET" "/api/v1/cache/jobs?status=pending&limit=5" "" "List pending jobs"

# Test 9: Test missing API key (should fail)
echo -e "${BLUE}Test 9: Missing API Key (Should Fail)${NC}"
curl -s -X GET "$API_URL/api/v1/cache/jobs" | jq '.'
echo ""
echo "---"
echo ""

# Test 10: Test rate limiting
echo -e "${BLUE}Test 10: Rate Limiting Test${NC}"
echo "Making 12 rapid requests (limit is 10 per minute)..."
for i in {1..12}; do
    echo -n "Request $i: "
    status=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/v1/cache/jobs" \
        -H "X-API-Key: $API_KEY")
    if [ "$status" = "429" ]; then
        echo -e "${RED}Rate limited (429)${NC}"
    else
        echo -e "${GREEN}OK ($status)${NC}"
    fi
    sleep 0.5
done
echo ""
echo "---"
echo ""

# Test 11: Cancel job (if we have a job ID)
if [ -n "$FIRST_JOB_ID" ]; then
    api_call "DELETE" "/api/v1/cache/jobs/$FIRST_JOB_ID" "" "Cancel job"
fi

# Test 12: Invalid job ID format
api_call "GET" "/api/v1/cache/jobs/invalid-id" "" "Get job with invalid ID format"

# Test 13: Non-existent job
api_call "GET" "/api/v1/cache/jobs/00000000-0000-0000-0000-000000000000" "" "Get non-existent job"

echo -e "${GREEN}Test script completed!${NC}"
echo ""
echo "Summary:"
echo "- API Gateway URL: $API_URL"
echo "- API Key: $API_KEY"
echo "- Created jobs can be monitored in the TeamCache Manager UI"
echo ""
echo "To monitor job processing:"
echo "  docker logs tc-mgr-backend -f"
echo ""
echo "To check API Gateway logs:"
echo "  docker logs tc-mgr-api-gateway -f"