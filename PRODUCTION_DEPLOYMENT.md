# Production Deployment Guide for TeamCache Manager with Multi-Filespace Support

Version 1.8.0  
Last Updated: 2025-09-01

## Table of Contents

1. [Overview](#overview)
2. [Docker Compose Files Structure](#docker-compose-files-structure)
3. [Multi-Filespace Configuration](#multi-filespace-configuration)
4. [Admin Password Special Characters](#admin-password-special-characters)
5. [Production Deployment Steps](#production-deployment-steps)
6. [Verification and Testing](#verification-and-testing)
7. [Troubleshooting](#troubleshooting)

## Overview

This guide covers production deployment of TeamCache Manager with multi-filespace support for LucidLink. Version 1.8.0+ includes support for multiple LucidLink filespaces with visual identification in the UI.

## Docker Compose Files Structure

Production deployment uses **THREE** compose files in layered sequence:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.production.yml up
```

### File Purposes:
- **`docker-compose.yml`** - Base configuration shared across all environments
- **`docker-compose.prod.yml`** - Production settings with defaults (primary production file, 156 lines)
- **`docker-compose.production.yml`** - Security overlay that removes defaults and enforces environment variables (76 lines)

**Important**: `docker-compose.prod.yml` is the PRIMARY production configuration file, NOT `docker-compose.production.yml` alone.

## Multi-Filespace Configuration

### Environment Variables Setup

Create your production `.env` file with multi-filespace support:

```bash
# ============================================
# CRITICAL PATH CONFIGURATION
# ============================================
# Must include ALL filespace mount points
INDEX_ROOT_PATHS=/media/lucidlink-1,/media/lucidlink-2
ALLOWED_PATHS=/media/lucidlink-1,/media/lucidlink-2

# ============================================
# FILESPACE 1 CONFIGURATION (PRIMARY)
# ============================================
LUCIDLINK_FILESPACE_1=your-filespace-1.domain
LUCIDLINK_USER_1=user@example.com
LUCIDLINK_PASSWORD_1='your_password_here'  # Use single quotes for special chars
LUCIDLINK_MOUNT_POINT_1=/media/lucidlink-1
LUCIDLINK_INSTANCE_1=2001
LUCIDLINK_API_PORT_1=9780

# ============================================
# FILESPACE 2 CONFIGURATION (OPTIONAL)
# ============================================
LUCIDLINK_FILESPACE_2=your-filespace-2.domain
LUCIDLINK_USER_2=user@example.com
LUCIDLINK_PASSWORD_2='your_password_here'
LUCIDLINK_MOUNT_POINT_2=/media/lucidlink-2
LUCIDLINK_INSTANCE_2=2002
LUCIDLINK_API_PORT_2=9781

# ============================================
# LEGACY SINGLE FILESPACE (DEPRECATED)
# ============================================
# Keep for backward compatibility but not used with multi-filespace
LUCIDLINK_FILESPACE=${LUCIDLINK_FILESPACE_1}
LUCIDLINK_USER=${LUCIDLINK_USER_1}
LUCIDLINK_PASSWORD=${LUCIDLINK_PASSWORD_1}
LUCIDLINK_MOUNT_POINT=${LUCIDLINK_MOUNT_POINT_1}

# ============================================
# DATABASE CONFIGURATION
# ============================================
DB_NAME=teamcache_db
DB_USER=teamcache_user
POSTGRES_PASSWORD='strong_db_password_here'  # Use single quotes

# ============================================
# AUTHENTICATION & SECURITY
# ============================================
JWT_SECRET='your-256-bit-secret-key-here'
ADMIN_USERNAME=admin
ADMIN_PASSWORD='YourSecureAdminPass2025!'  # Use single quotes for special chars

# ============================================
# SERVER CONFIGURATION
# ============================================
SERVER_HOST=your-domain.com  # Or IP address
SSL_ENABLED=true
```

### FILESPACE Column in UI

The file browser displays a FILESPACE column with colored badges:
- **Green badge (🟢)**: Files from Filespace 1
- **Orange badge (🟠)**: Files from Filespace 2

## Admin Password Configuration

Admin passwords work normally with special characters. Use any secure password:

```bash
# Examples of supported password formats
ADMIN_PASSWORD=SimplePass123
ADMIN_PASSWORD='Complex!P@ss$123'
ADMIN_PASSWORD="Another@Valid!Pass2025"
```

The backend handles password authentication correctly regardless of special characters.

## Production Deployment Steps

### 1. Generate Production Environment

```bash
# Clone or extract deployment package
cd /opt/tc-mgr/tc-manager

# Generate complete production environment file (recommended)
./scripts/generate-production-env.sh

# This will:
# - Interactive configuration for multi-filespace setup
# - Generate secure passwords automatically
# - Configure SSL/HTTPS settings
# - Create optimized production .env file

# Alternative: Manual configuration
# cp .env.example .env
# nano .env  # Edit with your values
```

### 2. Verify Configuration

```bash
# Verify environment configuration
./scripts/verify-env.sh

# This will check:
# - Required environment variables
# - LucidLink credentials
# - Database configuration
# - SSL certificate settings
```

### 3. Deploy with SSL

```bash
# Option 1: Nginx with self-signed certificate (default - works with IPs)
./scripts/deploy-production.sh nginx

# Option 2: Caddy with automatic Let's Encrypt (best for domain names)
./scripts/deploy-production.sh caddy

# Option 3: No SSL (development only - not recommended)
./scripts/deploy-production.sh none

# The deployment script will:
# - Build required Docker images
# - Initialize database with migrations
# - Start all services with proper dependencies
# - Generate SSL certificates if needed
# - Verify deployment health
```

### 4. Post-Deployment Verification

```bash
# The deploy-production.sh script automatically handles database initialization
# Manual verification is typically not needed, but you can check:

# Overall health check
curl https://your-domain.com/api/health

# Check container status
docker compose ps

# View deployment logs
docker compose logs -f backend

# Verify filespace support (optional)
docker exec tc-mgr-postgres psql -U teamcache_user -d teamcache_db \
  -c "SELECT * FROM information_schema.columns WHERE table_name = 'files' AND column_name = 'filespace_id';"
```

## Verification and Testing

### 1. Check Service Health

```bash
# Overall health check
curl https://your-domain.com/api/health

# Check container status
docker compose ps

# View logs
docker compose logs -f backend
```

### 2. Test Multi-Filespace Access

```bash
# Login and get token
TOKEN=$(curl -s -X POST https://your-domain.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your_password"}' | jq -r .token)

# Test Filespace 1
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/files?path=/media/lucidlink-1

# Test Filespace 2
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/files?path=/media/lucidlink-2

# Get filespaces configuration
curl -H "Authorization: Bearer $TOKEN" \
  https://your-domain.com/api/filespaces
```

### 3. Verify UI Features

1. Access https://your-domain.com
2. Login with admin credentials
3. Check left sidebar shows both filespace roots:
   - 📁 tc-east-1.dmpfs (FS-1)
   - 📁 tc-mngr-demo.dmpfs (FS-2)
4. Verify FILESPACE column shows proper badges
5. Test navigation in both filespaces

## Troubleshooting

### Issue: FS-2 Shows "Access Denied"

```bash
# Check environment variables
docker exec tc-mgr-backend env | grep ALLOWED_PATHS

# Should show both paths:
# ALLOWED_PATHS=/media/lucidlink-1,/media/lucidlink-2

# If not, recreate container
docker compose down backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.production.yml up -d backend
```

### Issue: FILESPACE Column Shows "unknown"

```bash
# Files need to be re-indexed with filespace information
# Option 1: Use Admin panel > Index Files button

# Option 2: Manually update database
docker exec tc-mgr-postgres psql -U teamcache_user -d teamcache_db -c "
UPDATE files 
SET filespace_id = 2, 
    filespace_name = 'your-filespace-2.domain',
    mount_point = '/media/lucidlink-2'
WHERE path LIKE '/media/lucidlink-2%';

UPDATE files 
SET filespace_id = 1, 
    filespace_name = 'your-filespace-1.domain',
    mount_point = '/media/lucidlink-1'
WHERE path LIKE '/media/lucidlink-1%';
"
```

### Issue: Directory Sizes Show "Loading..."

This is normal behavior on first access:
1. Directory sizes are computed asynchronously
2. Once computed, they're cached in the database
3. Subsequent access will show cached sizes immediately

To manually trigger computation:
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  https://your-domain.com/api/directory-sizes \
  -d '{"paths": ["/media/lucidlink-2/folder"]}'
```

### Issue: Password Authentication Fails

```bash
# Check what password is set in container
docker exec tc-mgr-backend env | grep ADMIN_PASSWORD

# Test password directly
curl -X POST https://your-domain.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your_actual_password"}'

# Common causes:
# 1. Wrong password in .env file
# 2. Container not restarted after changing .env
# 3. Typo in username (should be "admin")
```

### Issue: Multiple LucidLink Daemon Errors

```bash
# Check LucidLink instances
docker exec tc-mgr-backend lucid list

# If seeing "Multiple Lucid daemons detected", specify instance:
docker exec tc-mgr-backend lucid --instance 2001 status
docker exec tc-mgr-backend lucid --instance 2002 status
```

## Important Files Reference

### Configuration Files
- **Primary Production**: `docker-compose.prod.yml` (NOT docker-compose.production.yml alone)
- **Security Overlay**: `docker-compose.production.yml` (removes defaults)
- **Environment Template**: `.env.example` (updated for multi-filespace)
- **Generated Environment**: `.env` (created by generate-production-env.sh)

### Deployment Scripts (Current v1.8.0 Workflow)
- `scripts/generate-production-env.sh` - **Primary**: Interactive environment generation
- `scripts/deploy-production.sh` - **Primary**: Main deployment with SSL options
- `scripts/verify-env.sh` - Environment validation
- `scripts/smoke-test.sh` - Post-deployment testing

### Legacy Scripts (Still Available)
- `scripts/bootstrap-production.sh` - Older all-in-one setup script

### Database Migrations
- `backend/migrations/005_add_filespace_support.sql` - Multi-filespace schema

## Security Recommendations

1. **Use strong passwords** - combination of letters, numbers, and special characters
2. **Never commit** .env files to version control
3. **Regularly rotate** JWT secrets and admin passwords
4. **Monitor** failed login attempts in logs
5. **Keep** Docker and system packages updated
6. **Use** SSL/TLS in production (never deploy without it)
7. **Restrict** firewall rules to necessary ports only

## Performance Tuning

For production with multiple filespaces:

```bash
# Increase worker counts for parallel processing
CACHE_WORKER_COUNT=8
VIDEO_PREVIEW_WORKER_COUNT=4

# Increase Node.js memory
NODE_OPTIONS=--max-old-space-size=4096

# Optimize PostgreSQL
POSTGRES_SHARED_BUFFERS=512MB
POSTGRES_EFFECTIVE_CACHE_SIZE=2GB
```

## Support

- GitHub Issues: https://github.com/your-org/tc-manager/issues
- Documentation: This file and CLAUDE.md
- Version: TeamCache Manager v1.8.0 with Multi-Filespace Support

---

**Last Updated**: 2025-09-01  
**Version**: 1.8.0  
**Status**: Production Ready with Multi-Filespace Support