#!/bin/bash

# Generate secure passwords only (for reference or manual .env creation)
# For a complete .env file, use: ./scripts/generate-production-env.sh
set -euo pipefail

echo "🔐 Generating secure passwords only..."
echo ""
echo "⚠️  NOTE: This script only generates passwords!"
echo "👉 For a complete .env file, use: ./scripts/generate-production-env.sh"
echo ""
echo "# Password values for manual .env creation:"
echo ""

# Generate JWT secret (256-bit)
JWT_SECRET=$(openssl rand -hex 32)
echo "JWT_SECRET=$JWT_SECRET"

# Generate admin password (16 characters, alphanumeric + special)
ADMIN_PASSWORD=$(openssl rand -base64 12 | tr -d "=")
echo "ADMIN_PASSWORD=$ADMIN_PASSWORD"

# Generate database password (24 characters)
DB_PASSWORD=$(openssl rand -base64 18 | tr -d "=")
echo "POSTGRES_PASSWORD=$DB_PASSWORD"

echo ""
echo "⚠️  IMPORTANT: Save these values securely!"
echo "⚠️  Never commit them to version control!"
echo ""
echo "📝 Also remember to update:"
echo "   - SERVER_HOST with your server's IP or domain"
echo "   - LUCIDLINK_FILESPACE with your filespace"
echo "   - LUCIDLINK_USER with your LucidLink email"
echo "   - LUCIDLINK_PASSWORD with your LucidLink password"
echo "   - LUCID_S3_PROXY with your server IP"