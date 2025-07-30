#!/bin/bash

# SSL Certificate Generation Script for sc-mgr Production
# Generates self-signed certificates with proper SAN entries for host IP

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CERT_DIR="$PROJECT_DIR/ssl"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
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

# Detect host IP address
detect_host_ip() {
    local host_ip=""
    
    # Try multiple methods to detect external IP
    # Method 1: Default route interface
    if command -v ip >/dev/null 2>&1; then
        host_ip=$(ip route get 8.8.8.8 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1); exit}')
    fi
    
    # Method 2: hostname -I (fallback)
    if [[ -z "$host_ip" ]] && command -v hostname >/dev/null 2>&1; then
        host_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    
    # Method 3: ifconfig (fallback)
    if [[ -z "$host_ip" ]] && command -v ifconfig >/dev/null 2>&1; then
        host_ip=$(ifconfig 2>/dev/null | grep -E "inet [0-9]" | grep -v "127.0.0.1" | awk '{print $2}' | head -1)
    fi
    
    # Method 4: Environment variable override
    if [[ -n "$SSL_HOST_IP" ]]; then
        host_ip="$SSL_HOST_IP"
    fi
    
    # Validate IP address
    if [[ "$host_ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        echo "$host_ip"
    else
        log_error "Could not detect valid host IP address. Set SSL_HOST_IP environment variable."
    fi
}

# Create OpenSSL configuration
create_openssl_config() {
    local host_ip=$1
    local config_file="$CERT_DIR/openssl.cnf"
    
    cat > "$config_file" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=Local
L=Local
O=sc-mgr
OU=IT Department
CN=sc-mgr.local

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = sc-mgr.local
DNS.3 = *.sc-mgr.local
IP.1 = 127.0.0.1
IP.2 = $host_ip
EOF

    log_success "OpenSSL configuration created"
}

# Generate certificate and key
generate_certificate() {
    local host_ip=$1
    local key_file="$CERT_DIR/sc-mgr.key"
    local cert_file="$CERT_DIR/sc-mgr.crt"
    local config_file="$CERT_DIR/openssl.cnf"
    
    log_info "Generating SSL certificate for IP: $host_ip"
    
    # Generate private key
    openssl genrsa -out "$key_file" 2048 2>/dev/null
    # Set permissions so nginx user can read the key
    chmod 644 "$key_file"
    log_success "Private key generated"
    
    # Generate certificate
    openssl req -new -x509 -key "$key_file" -out "$cert_file" -days 365 \
        -config "$config_file" -extensions v3_req 2>/dev/null
    log_success "Certificate generated"
    
    # Set appropriate permissions
    chmod 600 "$key_file"
    chmod 644 "$cert_file"
    
    # Verify certificate
    log_info "Certificate details:"
    openssl x509 -in "$cert_file" -text -noout | grep -A 5 "Subject Alternative Name" || true
    
    local expires=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
    log_info "Certificate expires: $expires"
}

# Create nginx SSL configuration
create_nginx_ssl_config() {
    local host_ip=$1
    local nginx_ssl_conf="$CERT_DIR/nginx-ssl.conf"
    
    cat > "$nginx_ssl_conf" << EOF
# SSL Configuration for sc-mgr
# Include this in your nginx server block

# SSL Settings
ssl_certificate /etc/nginx/ssl/sc-mgr.crt;
ssl_certificate_key /etc/nginx/ssl/sc-mgr.key;

# SSL Security Settings
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# Security Headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# HTTPS Redirect (add to port 80 server block)
# return 301 https://\$server_name\$request_uri;
EOF

    log_success "Nginx SSL configuration created"
}

# Create Docker Compose SSL override
create_docker_ssl_override() {
    local ssl_override="$PROJECT_DIR/docker-compose.ssl.yml"
    
    # Only create if it doesn't exist (package deployments should have it)
    if [ -f "$ssl_override" ]; then
        log_info "docker-compose.ssl.yml already exists, skipping creation"
        return
    fi
    
    cat > "$ssl_override" << EOF
# SSL/HTTPS Override for Production
# Usage: docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up

services:
  frontend:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
      - ./frontend/nginx.ssl.conf:/etc/nginx/conf.d/default.conf:ro
    environment:
      - ENABLE_SSL=true

volumes:
  ssl_certs:
    driver: local
EOF

    log_success "Docker Compose SSL override created"
}


# Create certificate installation script
create_cert_install_script() {
    local host_ip=$1
    local install_script="$CERT_DIR/install-cert.sh"
    
    cat > "$install_script" << 'EOF'
#!/bin/bash

# Certificate Installation Helper
# Helps install the self-signed certificate in various browsers/systems

CERT_FILE="$(dirname "$0")/sc-mgr.crt"

echo "🔐 SSL Certificate Installation Helper"
echo "======================================"

if [[ ! -f "$CERT_FILE" ]]; then
    echo "❌ Certificate file not found: $CERT_FILE"
    exit 1
fi

echo "📍 Certificate location: $CERT_FILE"
echo ""

echo "🌐 To trust this certificate in browsers:"
echo ""

echo "Chrome/Chromium:"
echo "1. Go to chrome://settings/certificates"
echo "2. Click 'Authorities' tab"
echo "3. Click 'Import' and select: $CERT_FILE"
echo "4. Check 'Trust this certificate for identifying websites'"
echo ""

echo "Firefox:"
echo "1. Go to about:preferences#privacy"
echo "2. Scroll to 'Certificates' and click 'View Certificates'"
echo "3. Click 'Authorities' tab, then 'Import'"
echo "4. Select: $CERT_FILE"
echo "5. Check 'Trust this CA to identify websites'"
echo ""

echo "macOS System:"
echo "1. Double-click: $CERT_FILE"
echo "2. Add to 'System' keychain"
echo "3. Open Keychain Access, find 'sc-mgr.local'"
echo "4. Double-click > Trust > 'Always Trust'"
echo ""

echo "Linux System:"
echo "sudo cp '$CERT_FILE' /usr/local/share/ca-certificates/sc-mgr.crt"
echo "sudo update-ca-certificates"
echo ""

echo "⚠️  Remember: Self-signed certificates show security warnings"
echo "   For production, use certificates from a trusted CA"
echo ""
EOF
    
    chmod +x "$install_script"
    log_success "Certificate installation helper created"
}

# Main execution
main() {
    echo -e "${BLUE}🔐 SSL Certificate Generation for sc-mgr${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    # Check dependencies
    command -v openssl >/dev/null 2>&1 || log_error "OpenSSL is required but not installed"
    
    # Create SSL directory
    mkdir -p "$CERT_DIR"
    
    # Detect host IP
    local host_ip=$(detect_host_ip)
    log_info "Detected host IP: $host_ip"
    
    # Check if certificates already exist
    if [[ -f "$CERT_DIR/sc-mgr.crt" && -f "$CERT_DIR/sc-mgr.key" ]]; then
        local existing_ip=$(openssl x509 -in "$CERT_DIR/sc-mgr.crt" -text -noout | grep -A 5 "Subject Alternative Name" | grep "IP Address" | tail -1 | sed 's/.*IP Address://' | tr -d ' ')
        
        if [[ "$existing_ip" == "$host_ip" ]]; then
            log_warning "SSL certificates already exist for IP: $host_ip"
            echo -e "${YELLOW}Use --force to regenerate certificates${NC}"
            
            if [[ "$1" != "--force" ]]; then
                log_info "Skipping certificate generation (use --force to override)"
                exit 0
            fi
        fi
    fi
    
    # Generate certificates
    create_openssl_config "$host_ip"
    generate_certificate "$host_ip"
    create_nginx_ssl_config "$host_ip"
    create_docker_ssl_override
    create_cert_install_script "$host_ip"
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}🎉 SSL Certificate Generation Complete!${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    echo -e "${YELLOW}📋 Generated Files:${NC}"
    echo -e "• Certificate: $CERT_DIR/sc-mgr.crt"
    echo -e "• Private Key: $CERT_DIR/sc-mgr.key"
    echo -e "• Nginx Config: $CERT_DIR/nginx-ssl.conf"
    echo -e "• Docker Override: docker-compose.ssl.yml"
    echo -e "• Install Helper: $CERT_DIR/install-cert.sh"
    echo ""
    
    echo -e "${YELLOW}⚙️  Update your .env file with SSL certificate paths:${NC}"
    echo -e "SSL_CERT_PATH=./ssl/sc-mgr.crt"
    echo -e "SSL_KEY_PATH=./ssl/sc-mgr.key"
    echo -e "DOMAIN_NAME=$host_ip"
    echo ""
    
    echo -e "${YELLOW}🚀 To use HTTPS in production:${NC}"
    echo -e "docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up"
    echo ""
    
    echo -e "${YELLOW}🌐 Access URLs:${NC}"
    echo -e "• HTTP:  http://$host_ip:80 (redirects to HTTPS)"
    echo -e "• HTTPS: https://$host_ip:443"
    echo -e "• Local: https://localhost:443"
    echo ""
    
    echo -e "${YELLOW}🔐 To install certificate in browsers:${NC}"
    echo -e "Run: $CERT_DIR/install-cert.sh"
    echo ""
    
    echo -e "${RED}⚠️  Security Note:${NC}"
    echo -e "Self-signed certificates will show browser warnings."
    echo -e "For production, consider using Let's Encrypt or a trusted CA."
}

# Run with force flag support
main "$@"