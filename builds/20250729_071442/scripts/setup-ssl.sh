#!/bin/bash

# SSL/TLS Setup Script for TeamCache Manager
# Supports both Let's Encrypt and self-signed certificates

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration
SSL_DIR="${PROJECT_DIR}/ssl"
DOMAIN="${1:-}"
EMAIL="${2:-}"
USE_LETSENCRYPT="${USE_LETSENCRYPT:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🔐 TeamCache Manager SSL/TLS Setup${NC}"
echo ""

# Create SSL directory
mkdir -p "$SSL_DIR"
chmod 700 "$SSL_DIR"

if [ "$USE_LETSENCRYPT" = "true" ] && [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
    echo -e "${GREEN}📜 Setting up Let's Encrypt SSL certificate...${NC}"
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        echo -e "${YELLOW}Installing certbot...${NC}"
        sudo apt-get update
        sudo apt-get install -y certbot
    fi
    
    # Stop any running services on port 80
    echo -e "${YELLOW}Stopping services on port 80...${NC}"
    docker compose -f docker-compose.yml -f docker-compose.prod.yml down 2>/dev/null || true
    
    # Get certificate
    echo -e "${GREEN}Requesting certificate for $DOMAIN...${NC}"
    sudo certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        --domains "$DOMAIN" \
        --cert-path "$SSL_DIR/cert.pem" \
        --key-path "$SSL_DIR/key.pem" \
        --fullchain-path "$SSL_DIR/fullchain.pem"
    
    # Create symlinks for easy access
    sudo ln -sf "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/tc-mgr.crt"
    sudo ln -sf "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/tc-mgr.key"
    
    # Set up auto-renewal
    echo -e "${GREEN}Setting up auto-renewal...${NC}"
    cat > /tmp/certbot-renewal.sh << 'EOF'
#!/bin/bash
certbot renew --pre-hook "docker compose -f /opt/teamcache-manager/docker-compose.yml -f /opt/teamcache-manager/docker-compose.prod.yml down" --post-hook "docker compose -f /opt/teamcache-manager/docker-compose.yml -f /opt/teamcache-manager/docker-compose.prod.yml -f /opt/teamcache-manager/docker-compose.ssl.yml up -d"
EOF
    
    sudo mv /tmp/certbot-renewal.sh /etc/cron.daily/certbot-renewal
    sudo chmod +x /etc/cron.daily/certbot-renewal
    
    echo -e "${GREEN}✅ Let's Encrypt SSL certificate installed!${NC}"
    
else
    echo -e "${YELLOW}📝 Generating self-signed SSL certificate...${NC}"
    
    # Prompt for domain if not provided
    if [ -z "$DOMAIN" ]; then
        read -p "Enter domain name (or press Enter for localhost): " DOMAIN
        DOMAIN="${DOMAIN:-localhost}"
    fi
    
    # Generate self-signed certificate
    openssl req -x509 \
        -nodes \
        -days 365 \
        -newkey rsa:2048 \
        -keyout "$SSL_DIR/tc-mgr.key" \
        -out "$SSL_DIR/tc-mgr.crt" \
        -subj "/C=US/ST=State/L=City/O=TeamCache/CN=$DOMAIN" \
        -addext "subjectAltName = DNS:$DOMAIN,DNS:*.$DOMAIN,IP:127.0.0.1"
    
    echo -e "${GREEN}✅ Self-signed SSL certificate generated!${NC}"
    echo -e "${YELLOW}⚠️  Warning: Browsers will show security warnings for self-signed certificates${NC}"
fi

# Set proper permissions
chmod 600 "$SSL_DIR"/*.key
chmod 644 "$SSL_DIR"/*.crt

# Create Caddy configuration for automatic HTTPS
cat > "$PROJECT_DIR/frontend/Caddyfile.production" << EOF
{
    email ${EMAIL:-admin@$DOMAIN}
}

${DOMAIN:-localhost} {
    # Automatic HTTPS with Let's Encrypt
    tls {
        protocols tls1.2 tls1.3
    }
    
    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' wss://${DOMAIN:-localhost} https://${DOMAIN:-localhost}:3000"
    }
    
    # Frontend
    root * /usr/share/caddy
    file_server
    try_files {path} /index.html
    
    # API proxy
    reverse_proxy /api/* backend:3001
    
    # WebSocket proxy
    reverse_proxy /ws backend:3002
    
    # Compression
    encode gzip
    
    # Logging
    log {
        output file /var/log/caddy/access.log
        format json
    }
}

# Redirect HTTP to HTTPS
http://${DOMAIN:-localhost} {
    redir https://{host}{uri} permanent
}
EOF

echo ""
echo -e "${GREEN}📋 SSL Setup Summary:${NC}"
echo "   - SSL certificates location: $SSL_DIR"
echo "   - Certificate: $SSL_DIR/tc-mgr.crt"
echo "   - Private key: $SSL_DIR/tc-mgr.key"
echo "   - Domain: $DOMAIN"

if [ "$USE_LETSENCRYPT" = "true" ]; then
    echo "   - Type: Let's Encrypt (trusted)"
    echo "   - Auto-renewal: Enabled"
else
    echo "   - Type: Self-signed"
    echo "   - Validity: 365 days"
fi

echo ""
echo -e "${GREEN}🚀 Next steps:${NC}"
echo "1. Update your .env file with:"
echo "   SSL_ENABLED=true"
echo "   DOMAIN_NAME=$DOMAIN"
echo ""
echo "2. Start services with SSL:"
echo "   For Nginx: docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d"
echo "   For Caddy: docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d"
echo ""
echo -e "${GREEN}✨ SSL setup complete!${NC}"