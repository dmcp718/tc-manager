# Changelog

All notable changes to TeamCache Manager will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2024-07-26

### Changed
- **BREAKING**: Rebranded from "SiteCache Manager" to "TeamCache Manager"
- **BREAKING**: Container names changed from `sc-mgr-*` to `tc-mgr-*`
- **BREAKING**: Database index changed from `sitecache-files` to `teamcache-files`
- Updated all documentation to reflect new branding
- Improved production deployment process

### Added
- Comprehensive production deployment guide
- Automated SSL/TLS setup script with Let's Encrypt support
- Production-optimized Docker configurations
- Performance monitoring module for backend
- Database migration system with performance indexes
- Secure environment generation script
- Optimized nginx configuration for frontend
- Multi-stage Docker builds for smaller images
- Production build script with deployment packaging
- Backend performance configuration module
- Health check endpoints and monitoring
- Automated backup and restore scripts

### Security
- Removed hardcoded default passwords from production configs
- Added requirement for environment variables in production
- Removed debug console.log statements from media preview service
- Added secure headers to nginx configuration
- Implemented rate limiting for API endpoints
- Added CORS configuration options
- Enhanced JWT token security

### Performance
- Optimized frontend build process (removed source maps, inline chunks)
- Added nginx caching for static assets and API responses
- Implemented gzip and brotli compression support
- Optimized database connection pooling
- Added database query performance indexes
- Implemented materialized views for directory statistics
- Reduced Docker image sizes with multi-stage builds
- Added worker process optimization for nginx
- Implemented request buffering and connection reuse

### Fixed
- Removed temporary files and test scripts from repository
- Fixed environment variable naming inconsistencies
- Cleaned up development-only code from production builds
- Fixed Docker volume permissions for production

### Removed
- Test files and benchmark scripts
- Temporary backup files
- Development-specific configurations from production
- Unused dependencies from production builds

## [1.6.0] - 2024-07-24

### Added
- Comprehensive admin logs system with 8 categories
- Real-time WebSocket updates for cache job completion
- Terminal interface with host system access (admin-only)
- Comprehensive user management system
- BROWSER/ADMIN tabs with vertical admin interface
- Grafana integration for monitoring
- Cache worker performance optimizations
- Directory job submission support
- Field name compatibility for cache stats

### Fixed
- Cache worker parallelism limitations
- Job profile selection for image sequences
- Docker/backend connection issues
- Cache stats display updates
- Clear Jobs button to include index jobs

### Performance
- Improved cache worker performance from ~300 to 11,279 files/minute
- Implemented continuous processing for workers
- Optimized database connection pooling
- Reduced database queries through batching
- Added atomic work claiming with FOR UPDATE SKIP LOCKED

## [1.5.0] - 2024-07-10

### Added
- Advanced search with PostgreSQL and Elasticsearch dual engine
- File indexing system with automatic cleanup
- Cache job profiles for optimized processing
- WebSocket real-time updates
- Docker-based deployment architecture

### Changed
- Migrated from single-file to microservices architecture
- Implemented worker pattern for background jobs
- Added event-driven update system

## [1.0.0] - 2024-06-01

### Added
- Initial release of SiteCache Manager
- Basic file browser interface
- LucidLink filesystem integration
- Simple caching functionality
- User authentication system

---

*Note: For detailed migration instructions between versions, see MIGRATION.md*