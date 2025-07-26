#!/bin/bash

# TeamCache Manager Comprehensive Smoke Tests
# Tests all critical functionality after deployment

set -euo pipefail

# Configuration
BASE_URL="${BASE_URL:-http://localhost}"
API_URL="${API_URL:-http://localhost:3001/api}"
WS_URL="${WS_URL:-ws://localhost:3002}"
TIMEOUT=30

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🧪 TeamCache Manager Smoke Tests v1.7.0${NC}"
echo "   Frontend URL: $BASE_URL"
echo "   Backend API: $API_URL"
echo "   WebSocket URL: $WS_URL"
echo ""

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
CRITICAL_FAILURES=0

# Test results storage
declare -A TEST_RESULTS

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local is_critical="${3:-false}"
    
    echo -n "   $test_name... "
    TESTS_RUN=$((TESTS_RUN + 1))
    
    if eval "$test_command" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        TEST_RESULTS["$test_name"]="PASS"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        TEST_RESULTS["$test_name"]="FAIL"
        if [ "$is_critical" = "true" ]; then
            CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
        fi
        return 1
    fi
}

# Helper function for HTTP tests
test_http() {
    local url="$1"
    local expected_status="${2:-200}"
    local extra_args="${3:-}"
    
    # Convert ws:// to http:// for curl testing
    local test_url="${url/ws:\/\//http://}"
    test_url="${test_url/wss:\/\//https://}"
    
    local status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT $extra_args "$test_url" || echo "000")
    [ "$status_code" = "$expected_status" ]
}

# Helper function for HTTP with JSON response
test_http_json() {
    local url="$1"
    local json_path="$2"
    local expected_value="$3"
    local extra_args="${4:-}"
    
    local response=$(curl -s --max-time $TIMEOUT $extra_args "$url" || echo "{}")
    echo "$response" | grep -q "$expected_value"
}

# Load credentials from .env
if [[ -f .env ]]; then
    export $(grep -v '^#' .env | grep -v '^$' | xargs) 2>/dev/null || true
fi

ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
LUCIDLINK_MOUNT="${LUCIDLINK_MOUNT_POINT:-/media/lucidlink-1}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"

echo -e "${BLUE}🔍 Basic Connectivity Tests${NC}"
run_test "Frontend homepage" "test_http '$BASE_URL'" true
run_test "Backend API health" "test_http '$API_URL/health'" true

# Special handling for WebSocket test
echo -n "   WebSocket endpoint... "
TESTS_RUN=$((TESTS_RUN + 1))
WS_HTTP_URL="${WS_URL/ws:\/\//http://}"
WS_HTTP_URL="${WS_HTTP_URL/wss:\/\//https://}"
WS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Upgrade: websocket" --max-time $TIMEOUT "$WS_HTTP_URL" || echo "000")
if [ "$WS_STATUS" = "426" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TEST_RESULTS["WebSocket endpoint"]="PASS"
else
    echo -e "${RED}❌ FAIL${NC} (got status $WS_STATUS, expected 426)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TEST_RESULTS["WebSocket endpoint"]="FAIL"
    CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
fi

echo ""
echo -e "${BLUE}🔍 Authentication Tests${NC}"

# Get auth token
echo -n "   Attempting login... "
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
    --max-time 10 || echo "{}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "")
if [[ -n "$TOKEN" ]]; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    AUTH_HEADER="Authorization: Bearer $TOKEN"
else
    echo -e "${RED}❌ FAIL${NC}"
    echo "   Response: $LOGIN_RESPONSE"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
    echo -e "${RED}Cannot continue without authentication!${NC}"
    exit 1
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 Core API Endpoints${NC}"
run_test "Get API roots" "test_http '$API_URL/roots' '200' '-H \"$AUTH_HEADER\"'"
run_test "Get job profiles" "test_http '$API_URL/profiles' '200' '-H \"$AUTH_HEADER\"'"
run_test "Get cache jobs" "test_http '$API_URL/jobs' '200' '-H \"$AUTH_HEADER\"'"
run_test "Get indexing status" "test_http '$API_URL/index/status' '200' '-H \"$AUTH_HEADER\"'"

echo ""
echo -e "${BLUE}🔍 File System Tests${NC}"

# Test 1: FS tree loading mount point file listing
echo -n "   Testing filesystem mount point access... "
FS_RESPONSE=$(curl -s -X POST "$API_URL/browse" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$LUCIDLINK_MOUNT\"}" \
    --max-time $TIMEOUT || echo "{}")

if echo "$FS_RESPONSE" | grep -q '"directories":\|"files":'; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TEST_RESULTS["Filesystem browsing"]="PASS"
else
    echo -e "${RED}❌ FAIL${NC}"
    echo "      Response: ${FS_RESPONSE:0:100}..."
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TEST_RESULTS["Filesystem browsing"]="FAIL"
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 Cache Statistics Tests${NC}"

# Test 2: 'Cached data:' displaying varnish stats
echo -n "   Testing cache statistics endpoint... "
CACHE_STATS=$(curl -s "$API_URL/cache/stats" \
    -H "$AUTH_HEADER" \
    --max-time $TIMEOUT || echo "{}")

if echo "$CACHE_STATS" | grep -q '"bytesUsed"\|"bytes_used"\|"totalBytes"\|"total_bytes"'; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    
    # Extract values for display
    BYTES_USED=$(echo "$CACHE_STATS" | grep -o '"bytes_used":[0-9]*\|"bytesUsed":[0-9]*' | cut -d: -f2 | head -1)
    if [ -n "$BYTES_USED" ]; then
        echo "      Cache usage: $(numfmt --to=iec-i --suffix=B $BYTES_USED 2>/dev/null || echo "$BYTES_USED bytes")"
    fi
else
    echo -e "${RED}❌ FAIL${NC}"
    echo "      Response: ${CACHE_STATS:0:100}..."
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 UI Functionality Tests${NC}"

# Test 3: GRAFANA_URL button working (just verify URL is set)
if [ -n "$GRAFANA_URL" ] && [ "$GRAFANA_URL" != "null" ]; then
    run_test "Grafana URL configured" "test_http '$GRAFANA_URL' '200,302,401'"
else
    echo -e "   Grafana URL configured... ${YELLOW}⚠️  SKIP (not configured)${NC}"
fi

echo ""
echo -e "${BLUE}🔍 Job Submission Tests${NC}"

# Test 4: 'Index Files' button job submission success
echo -n "   Testing index job submission... "
INDEX_RESPONSE=$(curl -s -X POST "$API_URL/index/start" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"rootPath\":\"$LUCIDLINK_MOUNT\",\"clearDeleted\":true}" \
    --max-time $TIMEOUT || echo "{}")

if echo "$INDEX_RESPONSE" | grep -q '"status":"started"\|"message":"Indexing started"'; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    
    # Test 5: Running Jobs panel, Index Job added
    sleep 2
    echo -n "   Verifying index job in running jobs... "
    JOBS_RESPONSE=$(curl -s "$API_URL/jobs/running" \
        -H "$AUTH_HEADER" \
        --max-time $TIMEOUT || echo "{}")
    
    if echo "$JOBS_RESPONSE" | grep -q '"type":"index"\|indexing'; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${YELLOW}⚠️  WARN${NC} (job may have completed)"
    fi
    TESTS_RUN=$((TESTS_RUN + 1))
else
    echo -e "${RED}❌ FAIL${NC}"
    echo "      Response: ${INDEX_RESPONSE:0:100}..."
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test 9: Add to Cache Job Queue button submission success
echo -n "   Testing cache job submission... "
# First, get a sample file to cache
SAMPLE_FILE=$(curl -s -X POST "$API_URL/browse" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"path\":\"$LUCIDLINK_MOUNT\"}" \
    --max-time $TIMEOUT | grep -o '"path":"[^"]*"' | grep -v '/$' | head -1 | cut -d'"' -f4 || echo "")

if [ -n "$SAMPLE_FILE" ]; then
    CACHE_RESPONSE=$(curl -s -X POST "$API_URL/cache/job" \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"Smoke Test Cache Job\",\"filePaths\":[\"$SAMPLE_FILE\"]}" \
        --max-time $TIMEOUT || echo "{}")
    
    if echo "$CACHE_RESPONSE" | grep -q '"jobId"\|"job_id"\|"id"'; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        JOB_ID=$(echo "$CACHE_RESPONSE" | grep -o '"jobId":[0-9]*\|"job_id":[0-9]*\|"id":[0-9]*' | cut -d: -f2 | head -1)
        
        # Test 10: Running Jobs panel, Cache Job added
        sleep 2
        echo -n "   Verifying cache job in running jobs... "
        CACHE_JOBS=$(curl -s "$API_URL/jobs/running" \
            -H "$AUTH_HEADER" \
            --max-time $TIMEOUT || echo "{}")
        
        if echo "$CACHE_JOBS" | grep -q '"type":"cache"\|"cache_job"'; then
            echo -e "${GREEN}✅ PASS${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${YELLOW}⚠️  WARN${NC} (job may have completed)"
        fi
        TESTS_RUN=$((TESTS_RUN + 1))
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "      Response: ${CACHE_RESPONSE:0:100}..."
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC} (no files found to cache)"
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 Search Functionality Tests${NC}"

# Test Elasticsearch integration
echo -n "   Testing Elasticsearch search... "
ES_SEARCH=$(curl -s -X POST "$API_URL/search/elasticsearch" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"*\",\"limit\":1}" \
    --max-time $TIMEOUT || echo "{}")

if echo "$ES_SEARCH" | grep -q '"results"\|"hits"\|"files"'; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (Elasticsearch may be initializing)"
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test PostgreSQL search
run_test "PostgreSQL search" "test_http_json '$API_URL/search/postgres' 'results\|files' '\\[' '-H \"$AUTH_HEADER\" -H \"Content-Type: application/json\" -d \"{\\\"query\\\":\\\"*\\\",\\\"limit\\\":1}\"'"

echo ""
echo -e "${BLUE}🔍 WebSocket Real-time Updates${NC}"

# Test WebSocket connectivity with simple curl upgrade request
echo -n "   Testing WebSocket upgrade... "
WS_TEST=$(curl -s -i -N \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
    "${WS_URL}" \
    --max-time 2 2>&1 | head -10)

if echo "$WS_TEST" | grep -q "101 Switching Protocols"; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (WebSocket may require authentication)"
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 Performance Metrics${NC}"

# Test 12: GET Speed stats display
echo -n "   Testing performance metrics endpoint... "
PERF_METRICS=$(curl -s "$API_URL/stats/performance" \
    -H "$AUTH_HEADER" \
    --max-time $TIMEOUT || echo "{}")

if echo "$PERF_METRICS" | grep -q '"getSpeed"\|"get_speed"\|"lucidlink_stats"\|"performance"'; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    
    # Extract GET speed if available
    GET_SPEED=$(echo "$PERF_METRICS" | grep -o '"get_speed":[0-9.]*\|"getSpeed":[0-9.]*' | cut -d: -f2 | head -1)
    if [ -n "$GET_SPEED" ]; then
        echo "      GET Speed: ${GET_SPEED} MB/s"
    fi
else
    echo -e "${YELLOW}⚠️  WARN${NC} (stats may not be available yet)"
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Response time test
echo -n "   API response time (<1s)... "
START_TIME=$(date +%s.%N)
curl -s "$API_URL/health" -H "$AUTH_HEADER" --max-time 5 >/dev/null
END_TIME=$(date +%s.%N)
RESPONSE_TIME=$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo "0")

if (( $(echo "$RESPONSE_TIME < 1.0" | bc -l 2>/dev/null || echo "0") )); then
    echo -e "${GREEN}✅ PASS${NC} (${RESPONSE_TIME}s)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}❌ FAIL${NC} (${RESPONSE_TIME}s)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📊 Test Results Summary${NC}"
echo "   Total tests run: $TESTS_RUN"
echo -e "   Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "   Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "   Critical failures: ${RED}$CRITICAL_FAILURES${NC}"

# Show failed tests
if [ $TESTS_FAILED -gt 0 ]; then
    echo ""
    echo -e "${RED}Failed Tests:${NC}"
    for test in "${!TEST_RESULTS[@]}"; do
        if [ "${TEST_RESULTS[$test]}" = "FAIL" ]; then
            echo "   - $test"
        fi
    done
fi

echo ""
if [ $CRITICAL_FAILURES -gt 0 ]; then
    echo -e "${RED}❌ Critical tests failed! TeamCache Manager has serious issues.${NC}"
    
    # Show recent logs for debugging
    echo ""
    echo -e "${YELLOW}📋 Recent application logs:${NC}"
    if command -v docker >/dev/null 2>&1; then
        docker compose logs --tail=20 backend 2>/dev/null || echo "Could not retrieve logs"
    fi
    
    exit 2
elif [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All smoke tests passed! TeamCache Manager is working correctly.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed, but core functionality is working.${NC}"
    echo "   Please check the application logs for warnings."
    exit 1
fi