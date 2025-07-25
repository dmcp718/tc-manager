#!/bin/bash
# Development environment setup script for SiteCache Manager

set -e

echo "=== SiteCache Manager Development Setup ==="
echo ""

# Check if we're in the project root
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: This script must be run from the project root directory"
    exit 1
fi

# Create necessary directories
echo "1. Creating required directories..."
mkdir -p data/previews
mkdir -p backend/logs

# Generate host-info.json if it doesn't exist
if [ ! -f "host-info.json" ]; then
    echo "2. Generating host-info.json..."
    ./scripts/collect-host-info.sh
else
    echo "2. host-info.json already exists"
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "3. Creating .env file from template..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file and configure:"
    echo "   - SERVER_HOST (your server IP or domain)"
    echo "   - Database passwords"
    echo "   - LucidLink credentials"
    echo "   - JWT secret for production"
    echo ""
else
    echo "3. .env file already exists"
fi

# Check for .env.development.local
if [ ! -f ".env.development.local" ]; then
    echo "4. Creating .env.development.local..."
    cat > .env.development.local << 'EOF'
# Development Environment Local Overrides
# This file is gitignored and for your local development settings

# Set to your machine's IP for remote access
# SERVER_HOST=192.168.1.100

# Add your LucidLink credentials here
# LUCIDLINK_FILESPACE=your_filespace
# LUCIDLINK_USER=your_email
# LUCIDLINK_PASSWORD=your_password
EOF
    echo "   Created .env.development.local for your local overrides"
else
    echo "4. .env.development.local already exists"
fi

# Setup SSH for terminal feature (optional)
echo ""
echo "5. Terminal Feature Setup (Admin panel)"
echo "   The admin terminal requires SSH access to the host system."
echo ""
echo "   To enable terminal access:"
echo "   a) Start the backend container first:"
echo "      docker compose up -d backend"
echo ""
echo "   b) Get the container's SSH public key:"
echo "      docker exec sc-mgr-backend cat /root/.ssh/id_rsa.pub"
echo ""
echo "   c) Add the key to your host's authorized_keys:"
echo "      echo '<public_key>' >> ~/.ssh/authorized_keys"
echo ""
echo "   d) Update .env or .env.development.local with SSH settings:"
echo "      SSH_HOST=host.docker.internal  # or your host IP"
echo "      SSH_USER=your_username"
echo "      SSH_PORT=22"
echo ""

# Display next steps
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. (Optional) Configure .env.development.local for local overrides"
echo "3. Start the development environment:"
echo "   npm run dev"
echo ""
echo "4. Access the application:"
echo "   - If SERVER_HOST=localhost: http://localhost:3010"
echo "   - If SERVER_HOST=<your-ip>: http://<your-ip>:3010"
echo ""
echo "5. Login with:"
echo "   Username: admin"
echo "   Password: admin123 (change immediately!)"
echo ""