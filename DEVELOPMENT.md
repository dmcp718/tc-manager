# SiteCache Manager - Development Guide

This guide explains the improved development workflow for SiteCache Manager, designed to provide fast iteration during development while ensuring reliable production deployments.

## Quick Start

### Development Mode (Hot Reload)
```bash
# Start development environment with hot reload
npm run dev

# Or start services individually
npm run dev:services  # Start databases and services
npm run dev:frontend  # Start React dev server (port 3000)
npm run dev:backend   # Start Node.js with nodemon (port 3001)
```

### Production Mode
```bash
# Build and start production environment
npm run prod:build

# For greenfield deployment
./scripts/bootstrap-production.sh
```

## Development Workflow

### 1. Environment Setup

The project uses environment-specific configurations:

- **`.env.development`** - Committed development settings (safe defaults)
- **`.env`** - Local overrides (gitignored, create from `.env.example`)
- **`.env.production.example`** - Template for production deployment

### 2. Development Modes

#### Hot Reload Development (Recommended)
```bash
npm run dev
```
- Frontend: React dev server with hot reload (localhost:3000)
- Backend: Nodemon with auto-restart (localhost:3001)
- Services: PostgreSQL, Redis, Elasticsearch in Docker
- **Result**: Sub-second feedback loop for frontend changes

#### Containerized Development
```bash
npm run dev:build
```
- All services run in Docker with volume mounts
- Useful for testing container-specific behavior
- Slower than hot reload but matches production environment

### 3. File Structure

```
/sc-manager/
├── docker-compose.yml           # Base services (DB, Redis, ES)
├── docker-compose.dev.yml       # Development overrides
├── docker-compose.prod.yml      # Production configuration
├── .env.development            # Committed dev config
├── .env.example               # Local environment template
├── package.json              # Root scripts for workflow
├── backend/
│   ├── Dockerfile            # Multi-stage (dev/prod)
│   ├── package.json         # Backend-specific scripts
│   └── ...
├── frontend/
│   ├── Dockerfile           # Multi-stage (dev/prod)
│   ├── package.json        # Frontend scripts
│   └── src/
└── scripts/
    ├── bootstrap-production.sh
    └── ...
```

## Available Scripts

### Root Level Commands
```bash
# Development
npm run dev                 # Start full dev environment
npm run dev:frontend        # Frontend only (hot reload)
npm run dev:backend         # Backend only (with nodemon)
npm run dev:services        # Services only (DB, Redis, ES)
npm run dev:down           # Stop dev environment

# Production
npm run prod               # Start production environment
npm run prod:build         # Build and start production
npm run prod:down          # Stop production environment

# Building
npm run build              # Build both frontend and backend
npm run build:frontend     # Build frontend only
npm run build:backend      # Build backend only

# Testing
npm run test               # Run all tests
npm run test:frontend      # Frontend tests
npm run test:backend       # Backend tests

# Utilities
npm run install:all        # Install all dependencies
npm run clean              # Clean containers and volumes
npm run clean:images       # Clean containers, volumes, and images
npm run logs               # View all logs
npm run logs:backend       # Backend logs only
npm run logs:frontend      # Frontend logs only
```

### Backend Scripts
```bash
cd backend
npm run dev                # Nodemon with debugger
npm run dev:watch          # Nodemon with file watching
npm run dev:debug          # Nodemon with debug break
npm start                  # Production start
```

### Frontend Scripts
```bash
cd frontend
npm start                  # React dev server
npm run build              # Production build
npm test                   # Run tests
```

## Development Best Practices

### 1. Making Changes

#### Frontend Changes
1. Start dev environment: `npm run dev`
2. Edit files in `frontend/src/`
3. Changes appear instantly in browser (localhost:3000)
4. No Docker rebuilds required

#### Backend Changes
1. Start dev environment: `npm run dev`
2. Edit files in `backend/`
3. Nodemon automatically restarts server
4. API available at localhost:3001

#### Configuration Changes
1. Edit `.env.development` for committed changes
2. Edit `.env` for local overrides
3. Restart services: `npm run dev:down && npm run dev`

### 2. Testing Changes

#### Development Testing
```bash
# Test individual components
npm run dev:frontend       # Test frontend only
npm run dev:backend        # Test backend only

# Test full stack
npm run dev                # Test complete development setup
```

#### Production Testing
```bash
# Build and test production locally
npm run prod:build
curl http://localhost:8080  # Test frontend
curl http://localhost:3001/health  # Test backend
```

### 3. Debugging

#### Frontend Debugging
- Chrome DevTools work normally with dev server
- React DevTools extension supported
- Source maps enabled in development

#### Backend Debugging
```bash
# Start with debugger
npm run dev:debug

# Attach debugger
# VS Code: Use "Attach to Node.js" configuration
# Chrome: Open chrome://inspect
```

## Git Workflow

### 1. Development Workflow
```bash
# Start development
git checkout -b feature/my-feature
npm run dev

# Make changes (hot reload active)
# Edit frontend/src/App.js
# Changes appear instantly

# Test production build before commit
npm run prod:build

# Commit changes
git add .
git commit -m "Add new feature"
git push origin feature/my-feature
```

### 2. Environment Files in Git

#### Committed Files
- `.env.development` - Safe development defaults
- `.env.production` - Production template (no secrets)
- `.env.example` - Complete template with all options
- `docker-compose.*.yml` - All Docker configurations

#### Ignored Files (Never commit these!)
- `.env` - Active configuration with credentials
- `.env.local` - Local overrides
- `.env.development.local` - Development overrides
- `.env.production.local` - Production secrets
- `build/` - Built artifacts
- `host-info.json` - Generated system information

## Troubleshooting

### Common Issues

#### 1. Frontend shows "Network error. Please try again."
**Cause**: Frontend cannot connect to backend API
**Solutions**:
- Check `SERVER_HOST` is set correctly in `.env`
- Verify backend is running: `docker compose ps`
- Check backend logs: `docker compose logs backend`
- Ensure authentication token exists (login required)

#### 2. Empty file tree in BROWSER tab
**Cause**: LucidLink not mounted or authentication issue
**Solutions**:
- Verify LucidLink credentials in `.env`
- Check backend logs for mount errors
- Ensure you're logged in (admin/admin123 default)
- Verify filesystem mount: `docker exec sc-mgr-backend ls /media/lucidlink-1`

#### 3. Terminal shows "pty is not defined"
**Cause**: node-pty module not installed
**Solutions**:
- Rebuild backend with no-cache: `docker compose build --no-cache backend`
- Ensure python3 and build-essential are in Dockerfile

#### 4. host-info.json is empty (0 bytes)
**Cause**: Volume mount issue in development
**Solutions**:
- Run `./scripts/collect-host-info.sh` to generate file
- Restart backend: `docker compose restart backend`
- As workaround: `docker cp host-info.json sc-mgr-backend:/app/`

#### 5. Admin panel shows container hostname instead of SERVER_HOST
**Cause**: SERVER_HOST not passed to container
**Solutions**:
- Ensure SERVER_HOST is in `.env` or `.env.development.local`
- Recreate container: `docker compose up -d --force-recreate backend`

#### 6. Terminal cannot connect to host
**Cause**: SSH not configured
**Solutions**:
- Get container's SSH key: `docker exec sc-mgr-backend cat /root/.ssh/id_rsa.pub`
- Add to host's authorized_keys: `echo '<key>' >> ~/.ssh/authorized_keys`
- Set SSH_HOST, SSH_USER in `.env`

### Development Tips

1. **Always use SERVER_HOST**:
   - Set to `localhost` for local development
   - Set to your machine's IP for LAN access
   - Frontend URLs are automatically constructed

2. **Environment variable precedence**:
   - `.env.development.local` overrides `.env.development`
   - `.env.local` overrides `.env`
   - Docker Compose uses first file it finds

3. **Debugging frontend connection issues**:
   - Open browser console (F12)
   - Check Network tab for failed requests
   - Verify REACT_APP_* variables in container:
     ```bash
     docker exec sc-mgr-frontend env | grep REACT_APP
     ```

4. **Force rebuild when needed**:
   ```bash
   # After Dockerfile changes
   docker compose build --no-cache
   
   # After environment changes
   docker compose up -d --force-recreate
   ```

## Production Deployment

### 1. Greenfield Deployment
```bash
git clone <repo-url>
cd sitecache-manager
./scripts/bootstrap-production.sh
```

The bootstrap script will:
- Check system requirements
- Create environment files from templates
- Build production images
- Start services with health checks
- Run smoke tests
- Create systemd service (if root)

### 2. Updating Production
```bash
git pull origin main
npm run prod:build
npm run prod:down && npm run prod
```

### 3. Environment Configuration

Production deployments require configuring:
```bash
# Critical settings in .env
POSTGRES_PASSWORD=secure-random-password
JWT_SECRET=secure-random-key
ADMIN_USERNAME=your-admin
ADMIN_PASSWORD=secure-password

# LucidLink configuration
LUCIDLINK_FILESPACE=your-filespace
LUCIDLINK_USER=your-username
LUCIDLINK_PASSWORD=your-password

# Network configuration
REACT_APP_API_URL=http://your-server:3001/api
REACT_APP_WS_URL=ws://your-server:3002
```

## Troubleshooting

### Common Issues

#### "Port already in use"
```bash
# Check what's using the port
lsof -i :3000  # or :3001, :8080

# Stop all containers
npm run dev:down
npm run prod:down
```

#### "Module not found" errors
```bash
# Reinstall dependencies
npm run install:all

# Clear node_modules and reinstall
rm -rf node_modules frontend/node_modules backend/node_modules
npm run install:all
```

#### Changes not appearing
```bash
# For frontend changes
# Ensure you're accessing localhost:3000 (dev server)
# Not localhost:8080 (production build)

# For backend changes
# Check nodemon is running
npm run logs:backend
```

#### Docker issues
```bash
# Clean everything and restart
npm run clean
npm run dev:build
```

### Performance Tips

1. **Use hot reload**: `npm run dev` instead of Docker rebuilds
2. **Run services only**: `npm run dev:services` if you don't need containers
3. **Selective testing**: Use `npm run dev:frontend` or `npm run dev:backend`
4. **Clean regularly**: `npm run clean` to remove unused containers

## Migration from Old Workflow

### Old Way (Slow)
```bash
# Every change required
docker-compose build frontend  # 10+ seconds
docker-compose restart frontend
```

### New Way (Fast)
```bash
# One-time setup
npm run dev  # Starts dev environment

# Make changes - instant feedback
# Edit frontend/src/App.js
# Changes appear in ~0.5 seconds
```

The new workflow provides a **20x speed improvement** for frontend development iteration.