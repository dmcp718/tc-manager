# TeamCache Manager Scripts

This directory contains scripts for deployment, maintenance, and administration of TeamCache Manager.

## Environment Setup Scripts

### `generate-production-env.sh` ⭐ RECOMMENDED
**Creates a complete production-ready .env file**
- Prompts for all required configuration values
- Generates secure passwords automatically
- Creates a ready-to-use .env file
- Use this for new production deployments

```bash
./scripts/generate-production-env.sh
```

### `generate-passwords-only.sh`
**Only generates secure passwords** (not a complete .env file)
- Use only if you need password values for manual configuration
- Does NOT create a complete .env file
- For most users, use `generate-production-env.sh` instead

```bash
./scripts/generate-passwords-only.sh
```

### `verify-env.sh`
**Verifies your .env configuration**
- Checks all required variables are set
- Detects placeholder values
- Validates file permissions
- Run this before deployment

```bash
./scripts/verify-env.sh
```

## Build and Deployment Scripts

### `build-production.sh`
**Builds Docker images for production**
- Builds optimized frontend and backend images
- Creates deployment package with all necessary files
- Exports Docker images for transfer to production server

```bash
./scripts/build-production.sh
```

### `deploy-production.sh` ⭐ RECOMMENDED
**Complete production deployment script**
- Verifies environment configuration
- Builds Docker images (optional)
- Initializes database automatically
- Starts all services in correct order
- Performs health checks
- Supports SSL configurations

```bash
# Deploy without SSL
./scripts/deploy-production.sh

# Deploy with nginx SSL
./scripts/deploy-production.sh nginx

# Deploy with Caddy auto-SSL
./scripts/deploy-production.sh caddy
```

### `init-database.sh`
**Database initialization script**
- Creates all required tables
- Sets up default admin user
- Inserts default cache profiles
- Handles existing database safely

```bash
./scripts/init-database.sh
```

### `setup-ssl.sh`
**Sets up SSL/TLS certificates**
- Supports Let's Encrypt (recommended)
- Can generate self-signed certificates
- Creates proper SSL configuration

```bash
# For Let's Encrypt
USE_LETSENCRYPT=true ./scripts/setup-ssl.sh yourdomain.com your-email@domain.com

# For self-signed
./scripts/setup-ssl.sh yourdomain.com
```

## Database Management Scripts

### `backup-database.sh`
**Creates database backups**
- Compressed SQL dumps
- Timestamped backups
- Automatic cleanup of old backups

```bash
./scripts/backup-database.sh daily
./scripts/backup-database.sh manual-backup-name
```

### `restore-database.sh`
**Restores database from backup**
- Handles compressed backups
- Preserves existing data (with confirmation)

```bash
./scripts/restore-database.sh /path/to/backup.sql.gz
```

## Maintenance Scripts

### `clean-docker-images.sh`
**Cleans up Docker images**
- Removes all images except specified ones
- Cleans dangling images
- Shows before/after statistics

```bash
./scripts/clean-docker-images.sh
```

### `health-check.sh`
**Checks application health**
- Verifies all services are running
- Can be used with cron for monitoring
- Restarts services if needed

```bash
./scripts/health-check.sh
```

## Testing Scripts

### `smoke-test.sh`
**Runs basic smoke tests**
- Verifies deployment is working
- Tests authentication
- Checks core functionality

```bash
./scripts/smoke-test.sh
```

### `test-auth.sh`
**Tests authentication system**
- Verifies login functionality
- Tests JWT tokens
- Checks API access

```bash
./scripts/test-auth.sh
```

## Development Scripts

### `setup-development.sh`
**Sets up development environment**
- Installs dependencies
- Configures development database
- Sets up pre-commit hooks

```bash
./scripts/setup-development.sh
```

### `clean-deploy-test.sh`
**Tests clean deployment**
- Removes all containers and volumes
- Tests fresh installation
- Useful for testing deployment process

```bash
./scripts/clean-deploy-test.sh
```

## Script Execution Order for Production Deployment

### Option 1: Automated Deployment (Recommended)

1. **Generate environment configuration:**
   ```bash
   ./scripts/generate-production-env.sh
   ```

2. **Verify configuration:**
   ```bash
   ./scripts/verify-env.sh
   ```

3. **Deploy with automatic setup:**
   ```bash
   # Without SSL (for testing)
   ./scripts/deploy-production.sh
   
   # With SSL (for production)
   ./scripts/deploy-production.sh nginx
   ```

4. **Run smoke tests:**
   ```bash
   ./scripts/smoke-test.sh
   ```

5. **Set up backups:**
   ```bash
   crontab -e
   # Add: 0 2 * * * /opt/teamcache-manager/scripts/backup-database.sh daily
   ```

### Option 2: Manual Deployment

1. **Generate environment configuration:**
   ```bash
   ./scripts/generate-production-env.sh
   ```

2. **Verify configuration:**
   ```bash
   ./scripts/verify-env.sh
   ```

3. **Build production images:**
   ```bash
   ./scripts/build-production.sh
   ```

4. **Set up SSL (if needed):**
   ```bash
   ./scripts/setup-ssl.sh yourdomain.com your-email@domain.com
   ```

5. **Start services:**
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

6. **Initialize database:**
   ```bash
   ./scripts/init-database.sh
   ```

7. **Restart backend:**
   ```bash
   docker compose restart backend
   ```

## Important Notes

- Always run `verify-env.sh` before deployment
- Keep your .env file secure and never commit it to version control
- Test your backup/restore process regularly
- Use the monitoring scripts with cron for production systems