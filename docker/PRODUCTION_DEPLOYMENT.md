# Production Deployment Guide for Ubuntu 25

## Overview
This guide covers deploying SiteCache Manager on Ubuntu 25 using Docker with host network mode for optimal performance and direct LucidLink API access.

## Prerequisites
- Ubuntu 25 server
- Docker and Docker Compose installed
- LucidLink client installed and running
- PostgreSQL data directory with sufficient storage
- SSL certificates (optional but recommended)

## Configuration

### 1. Environment Variables
Create a `.env.production` file:

```bash
# Database
POSTGRES_PASSWORD=your_secure_password_here

# LucidLink Mount
LUCIDLINK_MOUNT=/mnt/lucidlink
INDEX_ROOT_PATH=/mnt/lucidlink
ALLOWED_PATHS=/mnt/lucidlink

# Network Interface (check with: ip addr)
NETWORK_INTERFACE=eth0

# Optional: Domain for SSL
DOMAIN_NAME=sitecache.yourdomain.com
```

### 2. Network Configuration
The production setup uses host network mode for the backend service, which provides:
- Direct access to LucidLink API on localhost:9782
- Better performance (no Docker network overhead)
- Simplified networking configuration

### 3. LucidLink Setup
Ensure LucidLink is configured to:
- Mount at `/mnt/lucidlink` (or your chosen path)
- API service running on port 9782
- Service starts automatically on boot

```bash
# Check LucidLink status
systemctl status lucidlink

# Verify API is accessible
curl http://localhost:9782/
```

## Deployment Steps

### 1. Clone Repository
```bash
git clone https://github.com/your-org/sitecache-browser.git
cd sitecache-browser
```

### 2. Build Images
```bash
# Use production compose file
docker compose -f docker-compose.production.yml build
```

### 3. Initialize Database
```bash
# Start only PostgreSQL first
docker compose -f docker-compose.production.yml up -d postgres

# Wait for initialization
sleep 10

# Verify database is ready
docker compose -f docker-compose.production.yml exec postgres psql -U sitecache_user -d sitecache_db -c "SELECT COUNT(*) FROM cache_job_profiles;"
```

### 4. Start All Services
```bash
docker compose -f docker-compose.production.yml up -d
```

### 5. Verify Deployment
```bash
# Check all services are running
docker compose -f docker-compose.production.yml ps

# Test backend API
curl http://localhost:3001/api/roots

# Test frontend
curl http://localhost/

# Test Direct Link functionality (with LucidLink running)
curl -X POST -H "Content-Type: application/json" \
  -d '{"filePath":"/mnt/lucidlink/test-file.mp4"}' \
  http://localhost:3001/api/direct-link
```

## Security Considerations

### 1. Firewall Configuration
```bash
# Allow only necessary ports
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 22/tcp   # SSH
sudo ufw enable
```

### 2. SSL/TLS Setup
1. Copy SSL certificates to the host
2. Mount them in the frontend container
3. Update nginx configuration to use HTTPS

### 3. Database Security
- Use strong passwords
- Consider restricting PostgreSQL to localhost only
- Regular backups of the database

## Monitoring and Maintenance

### View Logs
```bash
# All services
docker compose -f docker-compose.production.yml logs -f

# Specific service
docker compose -f docker-compose.production.yml logs -f backend
```

### Database Backup
```bash
# Backup database
docker compose -f docker-compose.production.yml exec postgres \
  pg_dump -U sitecache_user sitecache_db > backup_$(date +%Y%m%d).sql

# Restore database
docker compose -f docker-compose.production.yml exec -T postgres \
  psql -U sitecache_user sitecache_db < backup_20240715.sql
```

### Update Application
```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d
```

## Performance Tuning

### PostgreSQL Tuning
Edit PostgreSQL configuration for production workloads:
- Increase shared_buffers
- Adjust work_mem
- Configure checkpoint settings

### Frontend Caching
- Enable CDN for static assets
- Configure nginx caching headers
- Use Redis for session storage (optional)

## Troubleshooting

### Backend Cannot Connect to Database
- Since backend uses host network, it connects to localhost:5432
- Ensure PostgreSQL is listening on all interfaces or at least localhost

### Direct Link API Connection Issues
- Verify LucidLink service is running
- Check if API is bound to localhost:9782
- Test with: `curl http://localhost:9782/`

### File Access Permissions
- Ensure Docker has read access to LucidLink mount
- Check mount permissions: `ls -la /mnt/lucidlink`