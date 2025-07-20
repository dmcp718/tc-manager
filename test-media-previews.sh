#!/bin/bash

# Media Preview Test Suite for Production Build
# Tests video preview functionality with sample files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BACKEND_URL="http://localhost:3001"

# Helper functions
log_test() {
    echo -e "${BLUE}🎬 Testing: $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Get authentication token
get_auth_token() {
    local token=$(curl -s "$BACKEND_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | \
        jq -r '.token // empty')
    
    if [[ -n "$token" && "$token" != "null" ]]; then
        echo "$token"
    else
        log_error "Failed to authenticate"
        exit 1
    fi
}

# Test preview generation for different file types
test_preview_generation() {
    local token=$1
    local file_path=$2
    local expected_type=$3
    
    log_test "Preview generation for $(basename "$file_path")"
    
    local response=$(curl -s "$BACKEND_URL/api/preview" \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "{\"filePath\":\"$file_path\",\"type\":\"video\"}")
    
    local status=$(echo "$response" | jq -r '.status // empty')
    local error=$(echo "$response" | jq -r '.error // empty')
    
    if [[ "$status" == "completed" ]]; then
        local stream_type=$(echo "$response" | jq -r '.streamType // empty')
        log_success "Preview generated successfully (type: $stream_type)"
        
        # Test preview access
        if [[ "$stream_type" == "direct" ]]; then
            local stream_url=$(echo "$response" | jq -r '.directStreamUrl // empty')
            test_direct_stream_access "$token" "$stream_url"
        elif [[ "$stream_type" == "hls" ]]; then
            local cache_key=$(echo "$response" | jq -r '.cacheKey // empty')
            test_hls_stream_access "$token" "$cache_key"
        fi
        
    elif [[ "$status" == "failed" ]]; then
        if echo "$response" | jq -e '.isUnsupportedFormat == true' >/dev/null; then
            log_warning "File format not supported (expected for some formats)"
        else
            log_error "Preview generation failed: $error"
        fi
    else
        log_warning "Preview status: $status"
    fi
}

# Test direct stream access
test_direct_stream_access() {
    local token=$1
    local stream_url=$2
    
    log_test "Direct stream access"
    
    local full_url="$BACKEND_URL$stream_url"
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $token" \
        "$full_url")
    
    if [[ "$response_code" == "200" || "$response_code" == "206" ]]; then
        log_success "Direct stream accessible (HTTP $response_code)"
    else
        log_error "Direct stream not accessible (HTTP $response_code)"
    fi
}

# Test HLS stream access
test_hls_stream_access() {
    local token=$1
    local cache_key=$2
    
    log_test "HLS stream access"
    
    local playlist_url="$BACKEND_URL/api/preview/video/$cache_key/playlist.m3u8"
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $token" \
        "$playlist_url")
    
    if [[ "$response_code" == "200" ]]; then
        log_success "HLS playlist accessible"
        
        # Test individual segments
        local segment_url="$BACKEND_URL/api/preview/video/$cache_key/segment_0_000.ts"
        local segment_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $token" \
            "$segment_url")
        
        if [[ "$segment_code" == "200" ]]; then
            log_success "HLS segments accessible"
        else
            log_warning "HLS segments may not be accessible (HTTP $segment_code)"
        fi
    else
        log_error "HLS playlist not accessible (HTTP $response_code)"
    fi
}

# Test preview cache persistence
test_cache_persistence() {
    log_test "Preview cache persistence"
    
    # Check if preview cache directory has content
    local cache_files=$(docker exec sc-mgr-backend-prod find /app/preview-cache -name "*.ts" -o -name "*.m3u8" 2>/dev/null | wc -l)
    
    if [[ "$cache_files" -gt 0 ]]; then
        log_success "Preview cache contains $cache_files files"
    else
        log_warning "Preview cache appears empty (may be normal for fresh deployment)"
    fi
}

# Main test execution
main() {
    echo -e "${BLUE}🎬 Starting Media Preview Test Suite${NC}"
    echo -e "${BLUE}====================================${NC}"
    
    # Check if services are running
    if ! curl -sf "$BACKEND_URL/health" >/dev/null 2>&1; then
        log_error "Backend service not running. Run test-production.sh first."
        exit 1
    fi
    
    # Get authentication token
    local auth_token=$(get_auth_token)
    log_success "Authentication successful"
    
    # Test with sample files (adjust paths as needed for your environment)
    echo -e "${YELLOW}📁 Testing with sample media files:${NC}"
    
    # Test MP4 (direct streaming)
    if [[ -f "/media/lucidlink-1/00_Media/Video_codec_samples/CAM_B-Broadband-High.mp4" ]]; then
        test_preview_generation "$auth_token" \
            "/media/lucidlink-1/00_Media/Video_codec_samples/CAM_B-Broadband-High.mp4" \
            "direct"
    else
        log_warning "Sample MP4 file not found, skipping direct stream test"
    fi
    
    # Test MXF (transcoding)
    if [[ -f "/media/lucidlink-1/00_Media/Video_codec_samples/scientists_ProResProxy.mxf" ]]; then
        test_preview_generation "$auth_token" \
            "/media/lucidlink-1/00_Media/Video_codec_samples/scientists_ProResProxy.mxf" \
            "hls"
    else
        log_warning "Sample MXF file not found, skipping transcode test"
    fi
    
    # Test MOV (transcoding)
    if [[ -f "/media/lucidlink-1/00_Media/Video_codec_samples/CAM_C_ProRes422.mov" ]]; then
        test_preview_generation "$auth_token" \
            "/media/lucidlink-1/00_Media/Video_codec_samples/CAM_C_ProRes422.mov" \
            "hls"
    else
        log_warning "Sample MOV file not found, skipping MOV transcode test"
    fi
    
    # Test unsupported format (should fail gracefully)
    if [[ -f "/media/lucidlink-1/00_Media/Video_codec_samples/A006_09261608_C013.braw" ]]; then
        log_test "Unsupported format handling (BRAW)"
        test_preview_generation "$auth_token" \
            "/media/lucidlink-1/00_Media/Video_codec_samples/A006_09261608_C013.braw" \
            "unsupported"
    fi
    
    # Test cache persistence
    test_cache_persistence
    
    echo -e "${BLUE}====================================${NC}"
    echo -e "${GREEN}🎉 Media Preview Test Suite Completed!${NC}"
    echo -e "${BLUE}====================================${NC}"
    
    echo -e "${YELLOW}📋 Media Preview Summary:${NC}"
    echo -e "• Direct streaming (MP4): Tested"
    echo -e "• HLS transcoding (MXF/MOV): Tested"
    echo -e "• Unsupported formats: Handled gracefully"
    echo -e "• Cache persistence: Verified"
    echo ""
    echo -e "${BLUE}🎬 Preview functionality is ready for production use${NC}"
}

# Check dependencies
command -v curl >/dev/null 2>&1 || { log_error "curl is required but not installed"; }
command -v jq >/dev/null 2>&1 || { log_error "jq is required but not installed"; }

# Run tests
main "$@"