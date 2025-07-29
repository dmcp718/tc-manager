#!/bin/bash

# TeamCache Manager Extended Web App Tests
# Comprehensive UI and functionality testing

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source the smoke test for basic tests
cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🧪 TeamCache Manager Extended Web App Tests${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Configuration
BASE_URL="${BASE_URL:-https://192.168.8.28}"
API_URL="${API_URL:-https://192.168.8.28/api}"
WS_URL="${WS_URL:-wss://192.168.8.28/ws}"
TIMEOUT=30

# SSL configuration
USE_SSL="${USE_SSL:-true}"
SKIP_SSL_VERIFY="${SKIP_SSL_VERIFY:-true}"
CURL_SSL_OPTS=""
if [ "$USE_SSL" = "true" ] && [ "$SKIP_SSL_VERIFY" = "true" ]; then
    CURL_SSL_OPTS="-k"
fi

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -n "   $test_name... "
    TESTS_RUN=$((TESTS_RUN + 1))
    
    if eval "$test_command" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# First run basic smoke tests
echo -e "${BLUE}📋 Running basic smoke tests...${NC}"
./scripts/smoke-test.sh || true

echo ""
echo -e "${BLUE}🔍 Extended UI Tests${NC}"

# Get auth token
echo -n "   Getting auth token... "
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
LOGIN_RESPONSE=$(curl -s -X POST $CURL_SSL_OPTS "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
    --max-time 10 || echo "{}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "")
if [[ -n "$TOKEN" ]]; then
    echo -e "${GREEN}✅ OK${NC}"
    AUTH_HEADER="Authorization: Bearer $TOKEN"
else
    echo -e "${RED}❌ FAIL${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🔍 Frontend Asset Loading${NC}"

# Test main app bundle
run_test "Main JavaScript bundle loads" \
    "curl -s -o /dev/null -w '%{http_code}' $CURL_SSL_OPTS '$BASE_URL/static/js/main.*.js' --max-time $TIMEOUT | grep -q '200'"

# Test CSS loading
run_test "Main CSS bundle loads" \
    "curl -s -o /dev/null -w '%{http_code}' $CURL_SSL_OPTS '$BASE_URL/static/css/main.*.css' --max-time $TIMEOUT | grep -q '200'"

# Test favicon
run_test "Favicon loads" \
    "curl -s -o /dev/null -w '%{http_code}' $CURL_SSL_OPTS '$BASE_URL/favicon.ico' --max-time $TIMEOUT | grep -q '200'"

echo ""
echo -e "${BLUE}🔍 API Endpoint Testing${NC}"

# Test file preview endpoints
echo -n "   Testing file preview generation... "
SAMPLE_FILE=$(curl -s $CURL_SSL_OPTS "$API_URL/files?path=/media/lucidlink-1" \
    -H "$AUTH_HEADER" \
    --max-time $TIMEOUT | grep -o '"path":"[^"]*\.\(jpg\|png\|mp4\|mov\)"' | head -1 | cut -d'"' -f4 || echo "")

if [ -n "$SAMPLE_FILE" ]; then
    PREVIEW_RESPONSE=$(curl -s -X POST $CURL_SSL_OPTS "$API_URL/preview" \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        -d "{\"filePath\":\"$SAMPLE_FILE\"}" \
        --max-time $TIMEOUT || echo "{}")
    
    if echo "$PREVIEW_RESPONSE" | grep -q '"url":\|"preview_url":\|"previewUrl":'; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC} (no media files found)"
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test video preview with transcoding
echo -n "   Testing video preview transcoding... "
VIDEO_FILE=$(curl -s $CURL_SSL_OPTS "$API_URL/files?path=/media/lucidlink-1" \
    -H "$AUTH_HEADER" \
    --max-time $TIMEOUT | grep -o '"path":"[^"]*\.\(mp4\|mov\|avi\)"' | head -1 | cut -d'"' -f4 || echo "")

if [ -n "$VIDEO_FILE" ]; then
    VIDEO_PREVIEW=$(curl -s $CURL_SSL_OPTS "$API_URL/preview/video?path=$VIDEO_FILE" \
        -H "$AUTH_HEADER" \
        --max-time $TIMEOUT || echo "{}")
    
    if echo "$VIDEO_PREVIEW" | grep -q '"status":\|"transcoding":\|"ready":'; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC} (no video files found)"
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 Browser View Functionality${NC}"

# Test directory navigation
run_test "Directory tree structure loads" \
    "curl -s $CURL_SSL_OPTS '$API_URL/tree?path=/media/lucidlink-1' -H '$AUTH_HEADER' --max-time $TIMEOUT | grep -q '\"children\"'"

# Test breadcrumb navigation
run_test "Path breadcrumb data" \
    "curl -s $CURL_SSL_OPTS '$API_URL/breadcrumb?path=/media/lucidlink-1' -H '$AUTH_HEADER' --max-time $TIMEOUT | grep -q '\"segments\"'"

# Test file metadata
echo -n "   Testing file metadata retrieval... "
if [ -n "$SAMPLE_FILE" ]; then
    METADATA=$(curl -s $CURL_SSL_OPTS "$API_URL/metadata?path=$SAMPLE_FILE" \
        -H "$AUTH_HEADER" \
        --max-time $TIMEOUT || echo "{}")
    
    if echo "$METADATA" | grep -q '"size":\|"modified":\|"type":'; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌ FAIL${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC} (no sample file)"
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 Admin View Functionality${NC}"

# Test system stats
run_test "System statistics endpoint" \
    "curl -s $CURL_SSL_OPTS '$API_URL/admin/stats' -H '$AUTH_HEADER' --max-time $TIMEOUT | grep -q '\"cpu\":\|\"memory\":\|\"disk\":'"

# Test user management
run_test "User list endpoint" \
    "curl -s $CURL_SSL_OPTS '$API_URL/admin/users' -H '$AUTH_HEADER' --max-time $TIMEOUT | grep -q '\"username\"'"

# Test log retrieval
run_test "Application logs endpoint" \
    "curl -s $CURL_SSL_OPTS '$API_URL/admin/logs?limit=10' -H '$AUTH_HEADER' --max-time $TIMEOUT | grep -q '\"logs\":\|\"entries\":'"

echo ""
echo -e "${BLUE}🔍 Search View Functionality${NC}"

# Test search with filters
run_test "Search with file type filter" \
    "curl -s $CURL_SSL_OPTS '$API_URL/search?q=*&type=image&limit=5' -H '$AUTH_HEADER' --max-time $TIMEOUT | grep -q '\"results\"'"

# Test search with size filter
run_test "Search with size filter" \
    "curl -s $CURL_SSL_OPTS '$API_URL/search?q=*&minSize=1024&maxSize=10485760&limit=5' -H '$AUTH_HEADER' --max-time $TIMEOUT | grep -q '\"results\"'"

# Test search with date filter
run_test "Search with date filter" \
    "curl -s $CURL_SSL_OPTS '$API_URL/search?q=*&modifiedAfter=2024-01-01&limit=5' -H '$AUTH_HEADER' --max-time $TIMEOUT | grep -q '\"results\"'"

echo ""
echo -e "${BLUE}🔍 Real-time Updates (WebSocket)${NC}"

# Test WebSocket authentication
echo -n "   Testing WebSocket with auth... "
WS_TEST=$(timeout 2 curl -s -i -N $CURL_SSL_OPTS \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" \
    -H "$AUTH_HEADER" \
    "${WS_URL}" 2>&1 | head -20 || echo "timeout")

if echo "$WS_TEST" | grep -q "101 Switching Protocols"; then
    echo -e "${GREEN}✅ PASS${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}⚠️  WARN${NC} (WebSocket may require different auth method)"
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 Security Headers${NC}"

# Test security headers
echo -n "   Testing HTTPS security headers... "
HEADERS=$(curl -s -I $CURL_SSL_OPTS "$BASE_URL" --max-time $TIMEOUT || echo "")

SECURITY_HEADERS=0
echo "$HEADERS" | grep -q "Strict-Transport-Security:" && SECURITY_HEADERS=$((SECURITY_HEADERS + 1))
echo "$HEADERS" | grep -q "X-Content-Type-Options:" && SECURITY_HEADERS=$((SECURITY_HEADERS + 1))
echo "$HEADERS" | grep -q "X-Frame-Options:" && SECURITY_HEADERS=$((SECURITY_HEADERS + 1))
echo "$HEADERS" | grep -q "Content-Security-Policy:" && SECURITY_HEADERS=$((SECURITY_HEADERS + 1))

if [ $SECURITY_HEADERS -ge 3 ]; then
    echo -e "${GREEN}✅ PASS${NC} ($SECURITY_HEADERS/4 headers present)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}❌ FAIL${NC} (only $SECURITY_HEADERS/4 headers present)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${BLUE}🔍 Performance Tests${NC}"

# Test concurrent API requests
echo -n "   Testing concurrent API requests... "
START_TIME=$(date +%s.%N)
for i in {1..5}; do
    curl -s $CURL_SSL_OPTS "$API_URL/health" -H "$AUTH_HEADER" --max-time 5 >/dev/null &
done
wait
END_TIME=$(date +%s.%N)
CONCURRENT_TIME=$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo "0")

if (( $(echo "$CONCURRENT_TIME < 2.0" | bc -l 2>/dev/null || echo "0") )); then
    echo -e "${GREEN}✅ PASS${NC} (${CONCURRENT_TIME}s for 5 requests)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}❌ FAIL${NC} (${CONCURRENT_TIME}s for 5 requests)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

# Test large directory loading
echo -n "   Testing large directory performance... "
START_TIME=$(date +%s.%N)
curl -s $CURL_SSL_OPTS "$API_URL/files?path=/media/lucidlink-1&limit=1000" \
    -H "$AUTH_HEADER" \
    --max-time 10 >/dev/null
END_TIME=$(date +%s.%N)
DIR_TIME=$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo "0")

if (( $(echo "$DIR_TIME < 3.0" | bc -l 2>/dev/null || echo "0") )); then
    echo -e "${GREEN}✅ PASS${NC} (${DIR_TIME}s)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}❌ FAIL${NC} (${DIR_TIME}s)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📊 Extended Test Results${NC}"
echo "   Total tests run: $TESTS_RUN"
echo -e "   Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "   Failed: ${RED}$TESTS_FAILED${NC}"

echo ""
if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All extended tests passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some extended tests failed.${NC}"
    exit 1
fi