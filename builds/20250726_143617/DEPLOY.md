# TeamCache Manager v1.7.0 Deployment

Built on: 20250726_143617

## IMPORTANT: Deployment Location

This package contains Docker images and configuration files, but you should deploy from the main TeamCache Manager repository directory, NOT from this extracted directory.

## For Fresh Installation on New Server

1. Clone the TeamCache Manager repository:
   ```bash
   git clone https://github.com/your-org/teamcache-manager.git
   cd teamcache-manager
   ```

2. Load the Docker images from this package:
   ```bash
   docker load -i /path/to/this/package/teamcache-backend-1.7.0.tar
   docker load -i /path/to/this/package/teamcache-frontend-1.7.0.tar
   ```

3. Create your production .env file:
   ```bash
   ./scripts/generate-production-env.sh
   ```

4. Verify configuration:
   ```bash
   ./scripts/verify-env.sh
   ```

5. Set up SSL certificates (optional):
   ```bash
   ./scripts/setup-ssl.sh yourdomain.com your-email@domain.com
   ```

6. Start the application:
   ```bash
   # Without SSL
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   
   # With SSL (nginx)
   docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.ssl.yml up -d
   
   # With SSL (Caddy - automatic HTTPS)
   docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.caddy.yml up -d
   ```

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
