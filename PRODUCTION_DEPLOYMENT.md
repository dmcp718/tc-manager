# TeamCache Manager Production Deployment Guide

Version 1.7.0
Last Updated: 2025-01-28

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Initial Server Setup](#initial-server-setup)
4. [Security Configuration](#security-configuration)
5. [Application Deployment](#application-deployment)
6. [SSL/TLS Setup](#ssltls-setup)
7. [Post-Deployment Configuration](#post-deployment-configuration)
8. [Monitoring and Maintenance](#monitoring-and-maintenance)
9. [Troubleshooting](#troubleshooting)
10. [Backup and Recovery](#backup-and-recovery)
11. [Video Preview Configuration](#video-preview-configuration)

## System Requirements

### Minimum Hardware Requirements
- CPU: 4 cores (8 cores recommended)
- RAM: 8GB (16GB recommended)
- Storage: 100GB SSD (adjust based on cache needs)
- Network: 1Gbps connection

### Software Requirements
- Ubuntu 20.04 LTS or later (or compatible Linux distribution)
- Docker Engine 24.0+
- Docker Compose 2.20+
- Git 2.25+
- OpenSSL 1.1.1+

### Network Requirements
- Ports to open:
  - 80 (HTTP)
  - 443 (HTTPS)
  - 3000 (Grafana, optional)
  - 22 (SSH, restricted)

## Pre-Deployment Checklist

- [ ] Server provisioned with required specifications
- [ ] Domain name configured and pointing to server IP
- [ ] SSH access configured with key-based authentication
- [ ] Firewall rules configured
- [ ] LucidLink credentials obtained
- [ ] Backup storage location configured
- [ ] Monitoring solution ready (optional)

## Initial Server Setup

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git wget htop iotop
```

### 2. Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 3. Configure System Limits

```bash
# Edit /etc/security/limits.conf
sudo nano /etc/security/limits.conf

# Add these lines:
* soft nofile 65536
* hard nofile 65536
* soft nproc 32768
* hard nproc 32768
```

### 4. Configure Kernel Parameters

```bash
# Edit /etc/sysctl.conf
sudo nano /etc/sysctl.conf

# Add these lines:
vm.max_map_count=262144
net.core.somaxconn=65535
net.ipv4.tcp_max_syn_backlog=65535
fs.file-max=2097152

# Apply changes
sudo sysctl -p
```

## Security Configuration

### 1. Configure Firewall

```bash
# Install and configure UFW
sudo apt install -y ufw

# Configure firewall rules
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp  # Grafana (optional)

# Enable firewall
sudo ufw enable
```

### 2. SSH Hardening

```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Recommended settings:
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2

# Restart SSH
sudo systemctl restart sshd
```

### 3. Install Fail2Ban

```bash
sudo apt install -y fail2ban

# Create local config
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Configure for Docker
sudo nano /etc/fail2ban/jail.local
# Add:
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

# Start fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Application Deployment

### 1. Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/teamcache-manager
sudo chown $USER:$USER /opt/teamcache-manager
cd /opt/teamcache-manager

# Clone repository
git clone https://github.com/your-org/teamcache-manager.git .
git checkout v1.7.0
```

### 2. Download LucidLink Binary

```bash
# Create directory for LucidLink binary
mkdir -p ../lucidlink-builds

# Download LucidLink (replace with your version)
wget -O ../lucidlink-builds/lucidlink_3.2.6817_amd64.deb \
  https://your-lucidlink-download-url/lucidlink_3.2.6817_amd64.deb
```

### 3. Generate and Configure Environment

```bash
# Generate complete .env file with all required values
./scripts/generate-production-env.sh

# This will prompt you for:
# - Server hostname/IP
# - SSL enabled (y/n)
# - LucidLink Filespace  
# - LucidLink username (email)
# - LucidLink password
# - Grafana URL (optional)

# The script will generate secure passwords and create a complete .env file
```

#### Verify Your .env File

```bash
# Run the automated verification script
./scripts/verify-env.sh

# This script will check:
# - All required variables are set
# - No placeholder values remain (like "GENERATE_" or "your_")
# - File permissions are secure (600)
# - Docker Compose can read the values
# - Optional configurations

# The script will show output like:
# ✅ SERVER_HOST = teamcache.example.com
# ✅ LUCIDLINK_FILESPACE = production.lucidlink.com
# ✅ ADMIN_PASSWORD is set (hidden)
# ❌ POSTGRES_PASSWORD contains placeholder value: your_very_strong_password_here

# Alternative manual verification:
grep -E "^(SERVER_HOST|LUCIDLINK_FILESPACE|LUCIDLINK_USER|JWT_SECRET|ADMIN_PASSWORD|POSTGRES_PASSWORD)=" .env

# Should show all 6 critical values without placeholders
```

#### Manual .env Creation (Alternative)

If you prefer to create the .env manually:

```bash
# Copy the production template
cp .env.production .env

# Generate secure passwords (for reference)
./scripts/generate-passwords-only.sh

# Edit .env and update ALL placeholder values
nano .env

# Critical values that MUST be changed:
# - POSTGRES_PASSWORD (replace "your_very_strong_password_here")
# - JWT_SECRET (replace "GENERATE_SECURE_JWT_SECRET_HERE")
# - ADMIN_PASSWORD (replace "GENERATE_STRONG_ADMIN_PASSWORD_HERE")
# - SERVER_HOST (set to your domain or IP) - REQUIRED for frontend URLs
# - LUCIDLINK_FILESPACE (your LucidLink filespace)
# - LUCIDLINK_USER (your LucidLink email)
# - LUCIDLINK_PASSWORD (your LucidLink password)
# - LUCID_S3_PROXY (http://YOUR_SERVER_IP:80)

# Video Preview Configuration (optional):
# - VIDEO_PREVIEW_WORKER_COUNT (default: 2)
# - VIDEO_PREVIEW_MAX_CONCURRENT (default: 2)
# - TRANSCODE_VIDEO_BITRATE (default: 1000k)
# - TRANSCODE_VIDEO_WIDTH (default: 1280)
# - TRANSCODE_VIDEO_HEIGHT (default: 720)
```

### 4. Deploy Application

#### Automated Deployment (Recommended)

Use the automated deployment script that handles all steps including database initialization:

```bash
# Deploy without SSL (for testing)
./scripts/deploy-production.sh none

# Deploy with nginx SSL (default)
./scripts/deploy-production.sh
# or explicitly:
./scripts/deploy-production.sh nginx

# Deploy with Caddy (automatic HTTPS)
./scripts/deploy-production.sh caddy

# The script will:
# 1. Verify environment configuration
# 2. Build Docker images (if needed)
# 3. Start PostgreSQL
# 4. Initialize database schema
# 5. Create admin user
# 6. Start all services
# 7. Verify deployment health
```

#### Manual Deployment (Alternative)

If you prefer manual control:

```bash
# 1. Build images
./scripts/build-production.sh

# 2. Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.production.yml up -d

# 3. Initialize database (REQUIRED on first deployment)
./scripts/init-database.sh

# 4. Restart backend to ensure proper connection
docker compose restart backend
```

## SSL/TLS Setup

### Option 1: Let's Encrypt (Recommended)

```bash
# Run SSL setup script
USE_LETSENCRYPT=true ./scripts/setup-ssl.sh your-domain.com your-email@domain.com

# Start with SSL
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d
```

### Option 2: Caddy (Automatic HTTPS)

```bash
# Use Caddy configuration
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d
```

### Option 3: Custom SSL Certificate

```bash
# Place your certificates in ssl directory
mkdir -p ssl
cp /path/to/cert.pem ssl/tc-mgr.crt
cp /path/to/key.pem ssl/tc-mgr.key
chmod 600 ssl/*.key

# Start with SSL
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d
```

## Post-Deployment Configuration

### 1. Initialize Database

```bash
# Run database migrations
docker compose exec backend node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool();

async function migrate() {
  const migrations = fs.readdirSync('./migrations').sort();
  for (const file of migrations) {
    console.log('Running migration:', file);
    const sql = fs.readFileSync('./migrations/' + file, 'utf8');
    await pool.query(sql);
  }
  console.log('Migrations complete');
  process.exit(0);
}

migrate().catch(console.error);
"
```

### 2. Verify Deployment

```bash
# Check service health
curl https://your-domain.com/api/health

# Check logs
docker compose logs -f

# Check service status
docker compose ps
```

### 3. Create Admin User

```bash
# Access the application
# Navigate to https://your-domain.com
# Login with credentials from .env.production
# Create additional users via Admin panel
```

### 4. Configure Grafana (Optional)

```bash
# Access Grafana at https://your-domain.com:3000
# Default credentials: admin/admin
# Add data sources and dashboards for monitoring
```

## Monitoring and Maintenance

### 1. Set Up Log Rotation

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/teamcache

# Add:
/opt/teamcache-manager/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 1000 1000
    sharedscripts
    postrotate
        docker exec tc-mgr-backend kill -USR1 1
    endscript
}
```

### 2. Configure Automated Backups

```bash
# Set up cron job for backups
crontab -e

# Add:
0 2 * * * /opt/teamcache-manager/scripts/backup-database.sh daily >> /var/log/teamcache-backup.log 2>&1
0 3 * * 0 /opt/teamcache-manager/scripts/backup-database.sh weekly >> /var/log/teamcache-backup.log 2>&1
```

### 3. Monitor System Resources

```bash
# Install monitoring tools
sudo apt install -y prometheus-node-exporter

# Check resource usage
docker stats
htop
iotop
```

### 4. Set Up Health Checks

```bash
# Create health check script
cat > /opt/teamcache-manager/scripts/health-check.sh << 'EOF'
#!/bin/bash
if ! curl -f -s https://your-domain.com/api/health > /dev/null; then
    echo "Health check failed at $(date)" | mail -s "TeamCache Alert" admin@your-domain.com
    docker compose restart backend
fi
EOF

chmod +x /opt/teamcache-manager/scripts/health-check.sh

# Add to cron
*/5 * * * * /opt/teamcache-manager/scripts/health-check.sh
```

## Troubleshooting

### Common Issues

#### 1. Environment Configuration Issues

```bash
# Error: "JWT_SECRET environment variable is required"
# Solution: Ensure .env file exists and contains all required values
test -f .env || echo "ERROR: .env file not found!"

# Verify Docker Compose is reading the .env file
docker compose config | grep JWT_SECRET

# If values show as empty, check:
# 1. .env file is in the project root (same directory as docker-compose.yml)
# 2. No spaces around = in .env file (correct: KEY=value, wrong: KEY = value)
# 3. Values don't have quotes unless they contain spaces

# Test environment loading
docker compose run --rm backend env | grep -E "(JWT_SECRET|ADMIN_PASSWORD|SERVER_HOST)"
```

#### 2. Cannot Connect to LucidLink

```bash
# Check LucidLink daemon
docker exec tc-mgr-backend lucid status

# Check mount point
docker exec tc-mgr-backend ls -la /media/lucidlink-1

# Restart backend
docker compose restart backend
```

#### 2. Database Connection Issues

```bash
# Check database
docker exec tc-mgr-postgres psql -U teamcache_user -d teamcache_db -c "SELECT 1"

# Check connection pool
docker logs tc-mgr-backend | grep "database"
```

#### 3. High Memory Usage

```bash
# Check memory usage
docker stats --no-stream

# Increase memory limits in docker-compose.prod.yml
# Restart services
docker compose down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### 4. SSL Certificate Issues

```bash
# Check certificate expiry
openssl x509 -in ssl/tc-mgr.crt -noout -dates

# Renew Let's Encrypt certificate
certbot renew --force-renewal

# Restart frontend
docker compose restart frontend
```

### Debug Commands

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Access container shell
docker exec -it tc-mgr-backend bash
docker exec -it tc-mgr-postgres psql -U teamcache_user -d teamcache_db

# Check disk usage
df -h
du -sh /var/lib/docker/volumes/*
```

## Backup and Recovery

### 1. Database Backup

```bash
# Manual backup
./scripts/backup-database.sh production-backup

# Restore from backup
./scripts/restore-database.sh /path/to/backup.sql.gz
```

### 2. Configuration Backup

```bash
# Backup configuration
tar -czf teamcache-config-$(date +%Y%m%d).tar.gz \
  .env.production \
  docker-compose*.yml \
  ssl/ \
  scripts/

# Store securely off-site
```

### 3. Full System Backup

```bash
# Stop services
docker compose down

# Backup everything
tar -czf teamcache-full-backup-$(date +%Y%m%d).tar.gz \
  /opt/teamcache-manager \
  /var/lib/docker/volumes/teamcache* \
  --exclude='*/node_modules' \
  --exclude='*/logs/*'

# Restart services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 4. Disaster Recovery

```bash
# On new server:
# 1. Complete initial server setup
# 2. Restore configuration
tar -xzf teamcache-config-*.tar.gz

# 3. Restore database
./scripts/restore-database.sh backup.sql.gz

# 4. Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Performance Tuning

### 1. Database Optimization

```sql
-- Connect to database
docker exec -it tc-mgr-postgres psql -U teamcache_user -d teamcache_db

-- Analyze tables
ANALYZE;

-- Check slow queries
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### 2. Cache Worker Tuning

```bash
# Edit .env.production
CACHE_WORKER_COUNT=8  # Increase for more parallelism
MAX_CONCURRENT_FILES=10  # Increase for faster processing
WORKER_POLL_INTERVAL=1000  # Decrease for more responsive workers
```

### 3. Elasticsearch Optimization

```bash
# Increase heap size
docker exec tc-mgr-elasticsearch \
  bin/elasticsearch-keystore add "ES_JAVA_OPTS" -x
# Enter: -Xms2g -Xmx2g

# Optimize index settings
curl -X PUT "localhost:9200/teamcache-files/_settings" \
  -H 'Content-Type: application/json' \
  -d '{
    "index": {
      "refresh_interval": "30s",
      "number_of_replicas": 0
    }
  }'
```

## Security Best Practices

1. **Regular Updates**
   - Keep Docker and system packages updated
   - Monitor security advisories
   - Update TeamCache Manager regularly

2. **Access Control**
   - Use strong passwords
   - Implement IP whitelisting if possible
   - Regular audit of user accounts

3. **Monitoring**
   - Monitor failed login attempts
   - Set up alerts for suspicious activity
   - Regular security scans

4. **Backups**
   - Test restore procedures regularly
   - Store backups securely off-site
   - Encrypt sensitive backups

## Video Preview Configuration

### 1. Environment Variables

```bash
# Video Preview Workers
VIDEO_PREVIEW_WORKER_COUNT=2      # Number of preview workers
VIDEO_PREVIEW_MAX_CONCURRENT=2    # Max concurrent previews per worker
VIDEO_PREVIEW_POLL_INTERVAL=5000  # Worker poll interval (ms)

# Video Transcoding Settings
TRANSCODE_VIDEO_BITRATE=1000k     # Video bitrate
TRANSCODE_VIDEO_MAXRATE=1500k     # Max video bitrate
TRANSCODE_VIDEO_BUFSIZE=2000k     # Buffer size
TRANSCODE_VIDEO_WIDTH=1280        # Output width
TRANSCODE_VIDEO_HEIGHT=720        # Output height

# Audio Transcoding Settings
TRANSCODE_AUDIO_BITRATE=128k      # Audio bitrate
TRANSCODE_AUDIO_CODEC=aac         # Audio codec
TRANSCODE_AUDIO_CHANNELS=2        # Audio channels
TRANSCODE_AUDIO_SAMPLE_RATE=48000 # Sample rate

# Preview Cache
PREVIEW_CACHE_DIR=/app/preview-cache           # Container path
PREVIEW_CACHE_HOST_PATH=./data/previews        # Host path
```

### 2. Preview Storage

```bash
# Create preview cache directory
mkdir -p ./data/previews
chown 1000:1000 ./data/previews

# Verify preview storage
docker exec tc-mgr-backend ls -la /app/preview-cache
```

### 3. Video Preview Database

The video preview schema is automatically initialized with:
- `video_preview_jobs` table for batch jobs
- `video_preview_job_items` table for individual files
- Metadata storage in files table JSONB column

### 4. Troubleshooting Video Previews

```bash
# Check video preview workers
curl http://localhost:3001/api/video-preview/status

# Monitor preview jobs
docker compose logs -f backend | grep -i preview

# Clear preview cache if needed
docker exec tc-mgr-backend rm -rf /app/preview-cache/*

# Check FFmpeg installation
docker exec tc-mgr-backend ffmpeg -version
```

### 5. Terminal WebSocket Configuration

For the Admin Terminal feature to work properly with nginx SSL:

```nginx
# The nginx.ssl.conf includes this configuration:
location /terminal {
    proxy_pass http://backend:3002/terminal;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## Support and Resources

- Documentation: https://docs.teamcache.io
- Issue Tracker: https://github.com/your-org/teamcache-manager/issues
- Community Forum: https://community.teamcache.io
- Email Support: support@teamcache.io

---

**TeamCache Manager v1.7.0** - Production Deployment Guide
Last Updated: 2025-01-28