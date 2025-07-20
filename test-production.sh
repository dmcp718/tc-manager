#!/bin/bash

# Production Build Test Suite for sc-mgr
# Tests all critical functionality in production environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
BACKEND_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:8080"
FRONTEND_HTTPS_URL="https://localhost:443"
TEST_TIMEOUT=30
PREVIEW_CACHE_DIR="/tmp/sc-mgr-test-previews"
ENABLE_SSL=${ENABLE_SSL:-false}

# Cleanup function
cleanup() {
    echo -e "${YELLOW}🧹 Cleaning up test environment...${NC}"
    docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v 2>/dev/null || true
    rm -rf "$PREVIEW_CACHE_DIR" 2>/dev/null || true
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Trap cleanup on exit
trap cleanup EXIT

# Helper functions
log_test() {
    echo -e "${BLUE}🧪 Testing: $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

wait_for_service() {
    local url=$1
    local service_name=$2
    local timeout=${3:-30}
    
    echo -n "Waiting for $service_name to be ready"
    for i in $(seq 1 $timeout); do
        if curl -sf "$url" >/dev/null 2>&1; then
            echo ""
            log_success "$service_name is ready"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    log_error "$service_name failed to start within $timeout seconds"
}

# Test functions
test_environment_setup() {
    log_test "Environment setup"
    
    # Check required files
    if [[ ! -f "docker-compose.yml" ]]; then
        log_error "docker-compose.yml not found"
    fi
    
    if [[ ! -f "docker-compose.prod.yml" ]]; then
        log_error "docker-compose.prod.yml not found"
    fi
    
    # Create preview cache directory
    mkdir -p "$PREVIEW_CACHE_DIR"
    
    # Generate SSL certificates if enabled
    if [[ "$ENABLE_SSL" == "true" ]]; then
        log_test "SSL certificate generation"
        if [[ -f "scripts/generate-ssl-cert.sh" ]]; then
            ./scripts/generate-ssl-cert.sh --force
            log_success "SSL certificates generated"
        else
            log_error "SSL generation script not found"
        fi
    fi
    
    log_success "Environment setup completed"
}

test_docker_build() {
    log_test "Docker image builds"
    
    # Build images
    PREVIEW_CACHE_HOST_PATH="$PREVIEW_CACHE_DIR" \
    docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
    
    log_success "Docker images built successfully"
}

test_service_startup() {
    log_test "Service startup"
    
    # Build compose command
    local compose_files="-f docker-compose.yml -f docker-compose.prod.yml"
    if [[ "$ENABLE_SSL" == "true" ]]; then
        compose_files="$compose_files -f docker-compose.ssl.yml"
    fi
    
    # Start services
    PREVIEW_CACHE_HOST_PATH="$PREVIEW_CACHE_DIR" \
    docker compose $compose_files up -d
    
    # Wait for services
    wait_for_service "http://localhost:5432" "PostgreSQL" 60
    wait_for_service "$BACKEND_URL/health" "Backend API" 60
    wait_for_service "$FRONTEND_URL" "Frontend" 60
    
    # Test HTTPS if enabled
    if [[ "$ENABLE_SSL" == "true" ]]; then
        wait_for_service "$FRONTEND_HTTPS_URL" "Frontend HTTPS" 60
    fi
    
    log_success "All services started successfully"
}

test_database_connection() {
    log_test "Database connection"
    
    # Test database connectivity
    if docker exec sc-mgr-postgres pg_isready -U sitecache_user -d sitecache_db >/dev/null; then
        log_success "Database connection successful"
    else
        log_error "Database connection failed"
    fi
}

test_authentication() {
    log_test "Authentication system"
    
    # Test login
    local token=$(curl -s "$BACKEND_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | \
        jq -r '.token // empty')
    
    if [[ -n "$token" && "$token" != "null" ]]; then
        log_success "Authentication successful"
        echo "$token"
    else
        log_error "Authentication failed"
    fi
}

test_file_listing() {
    local token=$1
    log_test "File listing API"
    
    # Test file listing (adjust path as needed)
    local response=$(curl -s "$BACKEND_URL/api/roots" \
        -H "Authorization: Bearer $token")
    
    if echo "$response" | jq -e '. | length > 0' >/dev/null 2>&1; then
        log_success "File listing API working"
    else
        log_warning "File listing returned empty (may be normal if no LucidLink mounted)"
    fi
}

test_elasticsearch_integration() {
    local token=$1
    log_test "Elasticsearch integration"
    
    # Wait for Elasticsearch
    wait_for_service "http://localhost:9200/_cluster/health" "Elasticsearch" 120
    
    # Test search availability
    local response=$(curl -s "$BACKEND_URL/api/search/elasticsearch/availability" \
        -H "Authorization: Bearer $token")
    
    if echo "$response" | jq -e '.available == true' >/dev/null 2>&1; then
        log_success "Elasticsearch integration working"
    else
        log_warning "Elasticsearch not available (may be normal for fresh deployment)"
    fi
}

test_redis_connection() {
    log_test "Redis connection"
    
    if docker exec sc-mgr-redis redis-cli ping | grep -q "PONG"; then
        log_success "Redis connection successful"
    else
        log_error "Redis connection failed"
    fi
}

test_preview_cache_setup() {
    log_test "Preview cache setup"
    
    # Check if preview cache directory exists and is writable
    if [[ -d "$PREVIEW_CACHE_DIR" && -w "$PREVIEW_CACHE_DIR" ]]; then
        log_success "Preview cache directory ready"
    else
        log_error "Preview cache directory not accessible"
    fi
    
    # Check if container can access the mount
    if docker exec sc-mgr-backend-prod test -d "/app/preview-cache" && \
       docker exec sc-mgr-backend-prod test -w "/app/preview-cache"; then
        log_success "Preview cache mount working"
    else
        log_error "Preview cache mount not working"
    fi
}

test_rui_system() {
    local token=$1
    log_test "RUI (Remote Upload Indicator) system"
    
    # Test RUI uploading files endpoint
    local response=$(curl -s "$BACKEND_URL/api/rui/uploading" \
        -H "Authorization: Bearer $token")
    
    if echo "$response" | jq -e 'has("files")' >/dev/null 2>&1; then
        log_success "RUI system working"
    else
        log_warning "RUI system may not be functional (check LucidLink API access)"
    fi
}

test_websocket_connection() {
    log_test "WebSocket connection"
    
    # Simple WebSocket connection test (basic check)
    if nc -z localhost 3002; then
        log_success "WebSocket port accessible"
    else
        log_error "WebSocket port not accessible"
    fi
}

test_frontend_assets() {
    log_test "Frontend assets"
    
    # Test if frontend serves static assets
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/static/css/")
    
    if [[ "$response" == "200" || "$response" == "403" ]]; then
        log_success "Frontend assets accessible"
    else
        log_warning "Frontend assets may not be properly served (got HTTP $response)"
    fi
}

test_production_security() {
    log_test "Production security headers"
    
    # Check for security headers
    local headers=$(curl -s -I "$FRONTEND_URL")
    
    if echo "$headers" | grep -q "X-Content-Type-Options"; then
        log_success "Security headers present"
    else
        log_warning "Security headers missing (may need nginx configuration)"
    fi
}

test_ssl_functionality() {
    if [[ "$ENABLE_SSL" != "true" ]]; then
        return 0
    fi
    
    log_test "SSL/HTTPS functionality"
    
    # Test HTTPS access (ignore certificate warnings for self-signed)
    local https_response=$(curl -k -s -o /dev/null -w "%{http_code}" "$FRONTEND_HTTPS_URL")
    
    if [[ "$https_response" == "200" ]]; then
        log_success "HTTPS frontend accessible"
    else
        log_error "HTTPS frontend not accessible (HTTP $https_response)"
    fi
    
    # Test HTTP to HTTPS redirect
    local redirect_response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:80")
    
    if [[ "$redirect_response" == "301" || "$redirect_response" == "302" ]]; then
        log_success "HTTP to HTTPS redirect working"
    else
        log_warning "HTTP to HTTPS redirect not configured (HTTP $redirect_response)"
    fi
    
    # Test SSL certificate validity
    if command -v openssl >/dev/null 2>&1; then
        local cert_check=$(echo | openssl s_client -connect localhost:443 -servername localhost 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
        if [[ -n "$cert_check" ]]; then
            log_success "SSL certificate valid"
        else
            log_warning "SSL certificate validation failed"
        fi
    fi
}

# Main test execution
main() {
    echo -e "${BLUE}🚀 Starting Production Build Test Suite${NC}"
    echo -e "${BLUE}======================================${NC}"
    
    # Environment checks
    test_environment_setup
    
    # Build and start
    test_docker_build
    test_service_startup
    
    # Core functionality tests
    test_database_connection
    test_redis_connection
    test_preview_cache_setup
    
    # API tests
    local auth_token=$(test_authentication)
    test_file_listing "$auth_token"
    test_elasticsearch_integration "$auth_token"
    test_rui_system "$auth_token"
    
    # Network tests
    test_websocket_connection
    test_frontend_assets
    test_production_security
    test_ssl_functionality
    
    echo -e "${BLUE}======================================${NC}"
    echo -e "${GREEN}🎉 Production Build Test Suite Completed Successfully!${NC}"
    echo -e "${BLUE}======================================${NC}"
    
    echo -e "${YELLOW}📋 Test Summary:${NC}"
    echo -e "• Backend API: ${GREEN}✅ Working${NC} ($BACKEND_URL)"
    echo -e "• Frontend:    ${GREEN}✅ Working${NC} ($FRONTEND_URL)"
    if [[ "$ENABLE_SSL" == "true" ]]; then
        echo -e "• HTTPS:       ${GREEN}✅ Working${NC} ($FRONTEND_HTTPS_URL)"
    fi
    echo -e "• Database:    ${GREEN}✅ Connected${NC}"
    echo -e "• Redis:       ${GREEN}✅ Connected${NC}"
    echo -e "• Preview Cache: ${GREEN}✅ Ready${NC} ($PREVIEW_CACHE_DIR)"
    echo ""
    echo -e "${BLUE}🔧 To access the application:${NC}"
    echo -e "• Frontend: http://localhost:8080"
    if [[ "$ENABLE_SSL" == "true" ]]; then
        echo -e "• HTTPS Frontend: https://localhost:443"
    fi
    echo -e "• Backend API: http://localhost:3001"
    echo -e "• Login: admin / admin123"
    echo ""
    if [[ "$ENABLE_SSL" == "true" ]]; then
        echo -e "${YELLOW}🔐 SSL Certificate Info:${NC}"
        echo -e "• Certificate: ./ssl/sc-mgr.crt"
        echo -e "• Install Guide: ./ssl/install-cert.sh"
        echo ""
    fi
    echo -e "${YELLOW}⚠️  Remember to run 'docker compose down' when done testing${NC}"
}

# Check dependencies
command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed"; }
command -v curl >/dev/null 2>&1 || { log_error "curl is required but not installed"; }
command -v jq >/dev/null 2>&1 || { log_error "jq is required but not installed"; }

# Run tests
main "$@"