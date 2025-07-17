#!/bin/bash

echo "🔍 Testing SiteCache Browser Elasticsearch API Endpoints"
echo "======================================================="

# Base URL
BASE_URL="http://localhost:3001"

# Check if backend is running
echo -e "\n1. Checking backend health..."
curl -s "$BASE_URL/health" | jq . || echo "Backend not running!"

# Check Elasticsearch status
echo -e "\n2. Checking Elasticsearch status..."
curl -s "$BASE_URL/api/search/stats" | jq .

# Test PostgreSQL search (existing)
echo -e "\n3. Testing PostgreSQL search..."
curl -s "$BASE_URL/api/search?q=test" | jq '.[:2]'

# Test Elasticsearch search
echo -e "\n4. Testing Elasticsearch search..."
curl -s "$BASE_URL/api/search/es?q=video" | jq '.results[:2]'

# Test Boolean search
echo -e "\n5. Testing Boolean search..."
curl -s "$BASE_URL/api/search/es?q=proxy+AND+jpg" | jq '.results[:2]'

# Test filtered search
echo -e "\n6. Testing filtered search..."
curl -s "$BASE_URL/api/search/es?q=*&is_directory=false&cached=true" | jq '.results[:2]'

# Test with extension filter
echo -e "\n7. Testing extension filter..."
curl -s "$BASE_URL/api/search/es?q=*&extension=.mp4" | jq '.results[:2]'

# Test search suggestions
echo -e "\n8. Testing search suggestions..."
curl -s "$BASE_URL/api/search/suggestions?q=vid" | jq .

echo -e "\n✅ API endpoint tests complete!"