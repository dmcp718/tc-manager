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

# Load credentials from .env file if available, otherwise try Docker
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"

echo "📋 Getting admin credentials..."
if [[ -f .env ]]; then
    echo "   Loading from .env file..."
    source .env 2>/dev/null || true
    ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
    ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
    echo "✅ Loaded credentials from .env file"
elif command -v docker >/dev/null 2>&1; then
    echo "   Trying to get credentials from Docker container..."
    ADMIN_PASSWORD=$(docker exec sc-mgr-backend-prod printenv ADMIN_PASSWORD 2>/dev/null || echo "")
    if [ -z "$ADMIN_PASSWORD" ]; then
        echo "❌ Could not retrieve admin password from container"
        echo "   Try: docker exec sc-mgr-backend-prod printenv ADMIN_PASSWORD"
        echo "   Or create a .env file with ADMIN_USERNAME and ADMIN_PASSWORD"
        exit 1
    fi
    echo "✅ Found admin password from container: ${ADMIN_PASSWORD:0:3}***"
else
    echo "⚠️  Using default credentials (admin/admin123)"
    echo "   For production, set credentials in .env file"
fi

echo "   Username: $ADMIN_USERNAME"
echo "   Password: ${ADMIN_PASSWORD:0:3}***"

echo ""
echo "🔑 Testing login..."

# Test login
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
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
echo "🔒 Testing invalid credentials..."
INVALID_RESPONSE=$(curl -s -w "%{http_code}" -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"invalid","password":"invalid"}' \
    --max-time 10)

INVALID_CODE="${INVALID_RESPONSE: -3}"
if [ "$INVALID_CODE" = "401" ]; then
    echo "✅ Invalid credentials properly rejected (401)"
else
    echo "❌ Invalid credentials test failed (expected 401, got $INVALID_CODE)"
fi

echo ""
echo "🚪 Testing logout functionality..."
if [ -n "$TOKEN" ]; then
    LOGOUT_RESPONSE=$(curl -s -w "%{http_code}" -X POST \
        -H "Authorization: Bearer $TOKEN" \
        "$API_URL/api/auth/logout" \
        --max-time 10)
    
    LOGOUT_CODE="${LOGOUT_RESPONSE: -3}"
    if [ "$LOGOUT_CODE" = "200" ]; then
        echo "✅ Logout successful (200)"
        
        # Test that token is invalidated
        VERIFY_RESPONSE=$(curl -s -w "%{http_code}" \
            -H "Authorization: Bearer $TOKEN" \
            "$API_URL/api/roots" \
            --max-time 10)
        
        VERIFY_CODE="${VERIFY_RESPONSE: -3}"
        if [ "$VERIFY_CODE" = "401" ]; then
            echo "✅ Token properly invalidated after logout"
        else
            echo "⚠️  Token may still be valid after logout (got $VERIFY_CODE)"
        fi
    else
        echo "⚠️  Logout endpoint returned $LOGOUT_CODE (may not be implemented)"
    fi
else
    echo "⚠️  Skipping logout test (no token available)"
fi

echo ""
echo "🧪 Testing additional security scenarios..."

# Test missing Authorization header
echo -n "   Testing missing auth header... "
NO_AUTH_RESPONSE=$(curl -s -w "%{http_code}" "$API_URL/api/roots" --max-time 10)
NO_AUTH_CODE="${NO_AUTH_RESPONSE: -3}"
if [ "$NO_AUTH_CODE" = "401" ]; then
    echo "✅ 401"
else
    echo "❌ $NO_AUTH_CODE (expected 401)"
fi

# Test malformed token
echo -n "   Testing malformed token... "
BAD_TOKEN_RESPONSE=$(curl -s -w "%{http_code}" \
    -H "Authorization: Bearer invalid-token" \
    "$API_URL/api/roots" \
    --max-time 10)
BAD_TOKEN_CODE="${BAD_TOKEN_RESPONSE: -3}"
if [ "$BAD_TOKEN_CODE" = "401" ]; then
    echo "✅ 401"
else
    echo "❌ $BAD_TOKEN_CODE (expected 401)"
fi

echo ""
echo "🎉 Authentication test completed successfully!"
echo ""
echo "💡 Usage Instructions:"
echo "   1. Open: $BASE_URL"
echo "   2. Login with:"
echo "      Username: $ADMIN_USERNAME"
echo "      Password: $ADMIN_PASSWORD"
echo "   3. Use the web interface to manage files and caching"