#!/bin/bash

# SiteCache Browser Smoke Tests
# Basic functionality tests after deployment

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost}"
API_URL="${API_URL:-http://localhost:3001}"
TIMEOUT=30

echo "🧪 Running SiteCache Browser smoke tests..."
echo "   Frontend URL: $BASE_URL"
echo "   Backend API: $API_URL"
echo ""

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Helper function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -n "   Testing $test_name... "
    TESTS_RUN=$((TESTS_RUN + 1))
    
    if eval "$test_command" >/dev/null 2>&1; then
        echo "✅ PASS"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "❌ FAIL"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Helper function for HTTP tests
test_http() {
    local url="$1"
    local expected_status="${2:-200}"
    
    local status_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$url" || echo "000")
    [ "$status_code" = "$expected_status" ]
}

# Helper function for HTTP with JSON response
test_http_json() {
    local url="$1"
    local json_path="$2"
    local expected_value="$3"
    
    local response=$(curl -s --max-time $TIMEOUT "$url" || echo "{}")
    echo "$response" | grep -q "\"$json_path\".*$expected_value"
}

echo "🔍 Basic Connectivity Tests"
run_test "Frontend homepage" "test_http '$BASE_URL'"
run_test "Backend API root" "test_http '$API_URL'"
run_test "Health endpoint" "test_http '$API_URL/health'"
# Metrics endpoint removed - this is a management tool

echo ""
echo "🔍 API Functionality Tests"
run_test "Get API roots" "test_http '$API_URL/api/roots'"
run_test "Get job profiles" "test_http '$API_URL/api/profiles'"
run_test "Get cache jobs" "test_http '$API_URL/api/jobs'"
run_test "Get indexing status" "test_http '$API_URL/api/index/status'"

echo ""
echo "🔍 Health Check Details"
run_test "Database health" "test_http_json '$API_URL/health' 'database' 'true'"
run_test "Filesystem health" "test_http_json '$API_URL/health' 'filesystem' 'true'"

echo ""
echo "🔍 Frontend Asset Tests"
run_test "Static CSS files" "test_http '$BASE_URL/static/css/main.*\.css' '200'"
run_test "Static JS files" "test_http '$BASE_URL/static/js/main.*\.js' '200'"

echo ""
echo "🔍 WebSocket Test"
# Simple WebSocket connectivity test
if command -v node >/dev/null 2>&1; then
    run_test "WebSocket connection" "timeout 10s node -e \"
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://localhost:3002');
        ws.on('open', () => { console.log('ok'); process.exit(0); });
        ws.on('error', () => process.exit(1));
        setTimeout(() => process.exit(1), 5000);
    \" >/dev/null 2>&1"
else
    echo "   Testing WebSocket connection... ⏭️  SKIP (Node.js not available)"
fi

echo ""
echo "🔍 Performance Tests"
# Test response times
RESPONSE_TIME=$(curl -s -w "%{time_total}" -o /dev/null "$API_URL/health" || echo "999")
if (( $(echo "$RESPONSE_TIME < 1.0" | bc -l 2>/dev/null || echo "0") )); then
    echo "   Response time (<1s)... ✅ PASS (${RESPONSE_TIME}s)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "   Response time (<1s)... ❌ FAIL (${RESPONSE_TIME}s)"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
TESTS_RUN=$((TESTS_RUN + 1))

echo ""
echo "📊 Test Results Summary"
echo "   Tests run: $TESTS_RUN"
echo "   Passed: $TESTS_PASSED"
echo "   Failed: $TESTS_FAILED"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo "🎉 All smoke tests passed! SiteCache Browser is working correctly."
    exit 0
else
    echo ""
    echo "⚠️  Some smoke tests failed. Please check the application logs."
    
    # Show recent logs for debugging
    echo ""
    echo "📋 Recent application logs:"
    if command -v docker >/dev/null 2>&1; then
        docker compose logs --tail=20 backend 2>/dev/null || echo "Could not retrieve logs"
    fi
    
    exit 1
fi