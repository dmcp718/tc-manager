# TeamCache Manager v1.7.0 Deployment

Built on: 20250816_151025

## Package Contents

This is a self-contained deployment package that includes:
- Pre-built Docker images (teamcache-backend-1.7.0.tar, teamcache-frontend-1.7.0.tar)
- All configuration files (docker-compose.yml, etc.)
- Database schema files
- Deployment scripts
- SSL certificate generation tools

## Deployment Instructions

1. Extract this package to your deployment directory:
   ```bash
   cd /opt  # or your preferred location
   tar -xzf teamcache-1.7.0-*.tar.gz
   cd 20250816_151025
   ```

2. Load the Docker images:
   ```bash
   docker load -i teamcache-backend-1.7.0.tar
   docker load -i teamcache-frontend-1.7.0.tar
   ```

3. Create your production .env file:
   ```bash
   # Option 1: Generate new environment
   ./scripts/generate-production-env.sh
   
   # Option 2: Copy existing .env from your source
   cp /path/to/your/.env .
   ```

4. Verify configuration:
   ```bash
   ./scripts/verify-env.sh
   ```

5. Deploy the application:
   ```bash
   # IMPORTANT: Use --skip-build flag for package deployments
   
   # Deploy with nginx SSL (recommended for IP addresses)
   ./scripts/deploy-production.sh nginx --skip-build
   
   # Deploy with Caddy (automatic HTTPS for domain names)
   ./scripts/deploy-production.sh caddy --skip-build
   
   # Deploy without SSL (testing only)
   ./scripts/deploy-production.sh none --skip-build
   ```

The deployment script will automatically:
- Generate SSL certificates if needed (nginx mode)
- Initialize the database
- Create admin user
- Start all services
- Verify deployment health

## Post-Deployment

1. Verify health: https://yourdomain.com/api/health
2. Create additional users via Admin panel
3. Set up monitoring and backups
4. Configure log rotation

## Security Checklist

- [ ] Changed all default passwords
- [ ] SSL certificates installed
- [ ] Firewall configured (ports 80, 443, 3000 for Grafana)
- [ ] Backup schedule configured
- [ ] Monitoring alerts set up
