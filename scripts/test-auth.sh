#!/bin/bash

# Test Authentication for SC-Manager
# Quick script to verify admin login and API access

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8090}"
API_URL="${API_URL:-http://localhost:3001}"

echo "🔐 Testing SC-Manager Authentication..."
echo "   Frontend URL: $BASE_URL"
echo "   Backend API: $API_URL"
echo ""

# Get current admin password from environment
echo "📋 Getting admin credentials..."
if command -v docker >/dev/null 2>&1; then
    ADMIN_PASSWORD=$(docker exec sc-mgr-backend-prod printenv ADMIN_PASSWORD 2>/dev/null || echo "")
    if [ -z "$ADMIN_PASSWORD" ]; then
        echo "❌ Could not retrieve admin password from container"
        echo "   Try: docker exec sc-mgr-backend-prod printenv ADMIN_PASSWORD"
        exit 1
    fi
    echo "✅ Found admin password: ${ADMIN_PASSWORD:0:3}***"
else
    echo "❌ Docker not available - cannot retrieve password"
    exit 1
fi

echo ""
echo "🔑 Testing login..."

# Test login
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" \
    --max-time 10)

# Extract token from response
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 || echo "")

if [ -z "$TOKEN" ]; then
    echo "❌ Login failed!"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
fi

echo "✅ Login successful!"
echo "   Token: ${TOKEN:0:20}..."

echo ""
echo "🧪 Testing authenticated API endpoints..."

# Test authenticated endpoints
ENDPOINTS=(
    "/api/jobs"
    "/api/profiles" 
    "/api/roots"
    "/api/index/status"
)

for endpoint in "${ENDPOINTS[@]}"; do
    echo -n "   Testing $endpoint... "
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        "$API_URL$endpoint" \
        --max-time 10)
    
    if [ "$STATUS" = "200" ]; then
        echo "✅ $STATUS"
    else
        echo "❌ $STATUS"
    fi
done

echo ""
echo "🎉 Authentication test completed successfully!"
echo ""
echo "💡 Usage Instructions:"
echo "   1. Open: $BASE_URL"
echo "   2. Login with:"
echo "      Username: admin"
echo "      Password: $ADMIN_PASSWORD"
echo "   3. Use the web interface to manage files and caching"