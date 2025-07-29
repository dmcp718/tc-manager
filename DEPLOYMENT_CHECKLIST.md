# TeamCache Manager v1.7.0 - New System Deployment Checklist

## Prerequisites

- [ ] Ubuntu 20.04 LTS or later server with:
  - [ ] 4+ CPU cores (8 recommended)
  - [ ] 8GB+ RAM (16GB recommended)  
  - [ ] 100GB+ SSD storage
  - [ ] 1Gbps network connection
- [ ] SSH access with key-based authentication
- [ ] LucidLink credentials (filespace, username, password)
- [ ] LucidLink binary: `lucidlink_3.2.6817_amd64.deb` (or compatible version)

## Step 1: Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker installation
docker --version
docker compose version
```

## Step 2: Firewall Configuration

```bash
# Configure UFW
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Grafana (optional)
sudo ufw enable
```

## Step 3: Application Setup

### Option A: Using Pre-built Package

```bash
# 1. Create application directory
sudo mkdir -p /opt/teamcache-manager
sudo chown $USER:$USER /opt/teamcache-manager
cd /opt/teamcache-manager

# 2. Clone repository
git clone https://github.com/dmcp718/tc-manager.git .

# 3. Create LucidLink builds directory
mkdir -p ../lucidlink-builds

# 4. Download/copy LucidLink binary to the builds directory
# Place lucidlink_3.2.6817_amd64.deb in ../lucidlink-builds/

# 5. Extract deployment package
tar -xzf /path/to/teamcache-1.7.0-20250729_071442.tar.gz

# 6. Load Docker images
docker load -i 20250729_071442/teamcache-backend-1.7.0.tar
docker load -i 20250729_071442/teamcache-frontend-1.7.0.tar
```

### Option B: Building from Source

```bash
# 1. Create application directory
sudo mkdir -p /opt/teamcache-manager
sudo chown $USER:$USER /opt/teamcache-manager
cd /opt/teamcache-manager

# 2. Clone repository
git clone https://github.com/dmcp718/tc-manager.git .

# 3. Create LucidLink builds directory
mkdir -p ../lucidlink-builds

# 4. Download/copy LucidLink binary
# Place lucidlink_3.2.6817_amd64.deb in ../lucidlink-builds/

# 5. Build production images
./scripts/build-production.sh
```

## Step 4: Environment Configuration

```bash
# Generate production environment file
./scripts/generate-production-env.sh

# This will prompt for:
# - Server hostname/IP
# - SSL enabled (y/n)
# - LucidLink Filespace
# - LucidLink username (email)
# - LucidLink password
# - Grafana URL (optional)

# Verify configuration
./scripts/verify-env.sh
```

## Step 5: SSL Configuration (Choose One)

### Option A: nginx with Self-signed Certificate (IP addresses)
```bash
# Default option - works with IP addresses
./scripts/setup-ssl.sh
```

### Option B: Caddy with Let's Encrypt (Domain names)
```bash
# Requires valid domain name pointing to server
# Caddy will automatically obtain Let's Encrypt certificate
```

### Option C: Custom SSL Certificate
```bash
mkdir -p ssl
cp /path/to/cert.pem ssl/tc-mgr.crt
cp /path/to/key.pem ssl/tc-mgr.key
chmod 600 ssl/*.key
```

## Step 6: Deploy Application

```bash
# Deploy with nginx SSL (default, recommended for IP addresses)
./scripts/deploy-production.sh nginx

# OR deploy with Caddy (for domain names with automatic HTTPS)
./scripts/deploy-production.sh caddy

# OR deploy without SSL (development only)
./scripts/deploy-production.sh none
```

The deployment script will automatically:
- Verify environment configuration
- Start PostgreSQL
- Initialize database schema
- Create admin user
- Start all services
- Verify deployment health

## Step 7: Post-Deployment Verification

```bash
# Check service status
docker compose ps

# Check application health
curl -k https://your-server-ip/api/health
# OR
curl http://your-server-ip:3001/health

# View logs
docker compose logs -f

# Test login
# Browse to: https://your-server-ip
# Username: admin
# Password: (from ADMIN_PASSWORD in .env)
```

## Step 8: Initial Configuration

1. **Login to Web Interface**
   - Navigate to https://your-server-ip
   - Login with admin credentials

2. **Verify LucidLink Connection**
   - Check Admin > Settings
   - Verify filespace is mounted

3. **Start Initial Indexing**
   - Navigate to Browser tab
   - Click "Start Indexing"
   - Monitor progress

4. **Configure Video Previews** (Optional)
   - Video preview settings are configured in the .env file
   - Key environment variables:
     - VIDEO_PREVIEW_WORKER_COUNT (default: 2)
     - VIDEO_PREVIEW_MAX_CONCURRENT (default: 2)
     - TRANSCODE_VIDEO_BITRATE (default: 1000k)
     - TRANSCODE_VIDEO_WIDTH (default: 1280)
     - TRANSCODE_VIDEO_HEIGHT (default: 720)
   - After changing settings, restart the backend: `docker compose restart backend`

## Troubleshooting

### Common Issues

1. **"Invalid credentials" error**
   ```bash
   # Database may not be initialized
   ./scripts/init-database.sh
   docker compose restart backend
   ```

2. **Container name conflicts**
   ```bash
   # Clean up old containers
   docker compose down
   docker system prune -a
   ./scripts/deploy-production.sh nginx
   ```

3. **Elasticsearch "ES OFF" status**
   ```bash
   # Check disk space (must be <90% full)
   df -h
   # Check Elasticsearch status
   curl http://localhost:9200/_cluster/health
   ```

4. **LucidLink not mounting**
   ```bash
   # Check LucidLink daemon
   docker exec tc-mgr-backend lucid status
   # Verify credentials in .env
   ```

### Useful Commands

```bash
# View all logs
docker compose logs -f

# Restart specific service
docker compose restart backend

# Database backup
./scripts/backup-database.sh

# Complete reset
docker compose down -v
./scripts/deploy-production.sh nginx
```

## Maintenance

### Daily Tasks
- Monitor disk usage: `df -h`
- Check service health: `curl -k https://your-server-ip/api/health`
- Review logs for errors: `docker compose logs --since 24h | grep ERROR`

### Weekly Tasks
- Database backup: `./scripts/backup-database.sh weekly`
- Update system packages: `sudo apt update && sudo apt upgrade`
- Review and clean preview cache if needed

### Monthly Tasks
- Review user accounts and permissions
- Test backup restoration procedure
- Update Docker images if new version available

## Security Notes

1. **Change all default passwords** in production
2. **Enable firewall** and restrict SSH access
3. **Use SSL certificates** (self-signed or Let's Encrypt)
4. **Regular backups** of database and configuration
5. **Monitor logs** for suspicious activity
6. **Keep system updated** with security patches

## Support

- Repository: https://github.com/dmcp718/tc-manager
- Issues: https://github.com/dmcp718/tc-manager/issues
- Documentation: See PRODUCTION_DEPLOYMENT.md for detailed instructions