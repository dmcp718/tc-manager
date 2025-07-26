#!/bin/bash

# TeamCache Manager Deployment Script
# Usage: ./deploy.sh [environment] [options]
# Examples:
#   ./deploy.sh production
#   ./deploy.sh production --no-backup
#   ./deploy.sh development --rebuild

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Default values
ENVIRONMENT="${1:-production}"
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
REBUILD=false
NO_BACKUP=false
NO_MIGRATION=false

# Parse command line arguments
shift || true
while [[ $# -gt 0 ]]; do
    case $1 in
        --rebuild)
            REBUILD=true
            shift
            ;;
        --no-backup)
            NO_BACKUP=true
            shift
            ;;
        --no-migration)
            NO_MIGRATION=true
            shift
            ;;
        --help)
            echo "Usage: $0 [environment] [options]"
            echo "Options:"
            echo "  --rebuild      Force rebuild of Docker images"
            echo "  --no-backup    Skip database backup before deployment"
            echo "  --no-migration Skip database migrations"
            echo "  --help         Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Set environment-specific files
case $ENVIRONMENT in
    production)
        COMPOSE_FILE="docker-compose.production.yml"
        ENV_FILE=".env.production"
        ;;
    development|dev)
        COMPOSE_FILE="docker-compose.yml"
        ENV_FILE=".env"
        ;;
    *)
        echo "Error: Unknown environment '$ENVIRONMENT'"
        echo "Available environments: production, development"
        exit 1
        ;;
esac

echo "🚀 Starting deployment for environment: $ENVIRONMENT"
echo "📋 Configuration:"
echo "   - Compose file: $COMPOSE_FILE"
echo "   - Environment file: $ENV_FILE"
echo "   - Rebuild images: $REBUILD"
echo "   - Skip backup: $NO_BACKUP"
echo "   - Skip migration: $NO_MIGRATION"
echo ""

# Change to project directory
cd "$PROJECT_DIR"

# Check if required files exist
if [ ! -f "$COMPOSE_FILE" ]; then
    echo "❌ Error: Compose file not found: $COMPOSE_FILE"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: Environment file not found: $ENV_FILE"
    echo "💡 Tip: Copy from .env.example and customize"
    exit 1
fi

# Load environment variables
echo "📦 Loading environment variables..."
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs) || true

# Pre-deployment backup
if [ "$NO_BACKUP" = false ] && [ "$ENVIRONMENT" = "production" ]; then
    echo "💾 Creating pre-deployment backup..."
    if [ -f "$SCRIPT_DIR/backup-database.sh" ]; then
        "$SCRIPT_DIR/backup-database.sh" "pre_deploy_$(date +%Y%m%d_%H%M%S)" || {
            echo "❌ Backup failed! Aborting deployment."
            exit 1
        }
        echo "✅ Backup completed"
    else
        echo "⚠️  Warning: Backup script not found, skipping backup"
    fi
fi

# Pull latest images if not rebuilding
if [ "$REBUILD" = false ]; then
    echo "📥 Pulling latest images..."
    docker compose -f "$COMPOSE_FILE" pull || {
        echo "⚠️  Warning: Could not pull some images, will rebuild"
        REBUILD=true
    }
fi

# Build images if requested or pull failed
if [ "$REBUILD" = true ]; then
    echo "🔨 Building Docker images..."
    docker compose -f "$COMPOSE_FILE" build --no-cache
fi

# Stop existing services gracefully
echo "🛑 Stopping existing services..."
docker compose -f "$COMPOSE_FILE" down --timeout 30

# Start database first and wait for it to be ready
echo "🗄️  Starting database..."
docker compose -f "$COMPOSE_FILE" up -d postgres

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
RETRIES=30
while [ $RETRIES -gt 0 ]; do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U "${POSTGRES_USER:-sitecache_user}" >/dev/null 2>&1; then
        echo "✅ Database is ready"
        break
    fi
    echo "   Waiting for database... ($RETRIES attempts remaining)"
    sleep 2
    RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
    echo "❌ Database failed to start within timeout"
    echo "📋 Database logs:"
    docker compose -f "$COMPOSE_FILE" logs postgres
    exit 1
fi

# Run database migrations if needed
if [ "$NO_MIGRATION" = false ]; then
    echo "🔄 Running database migrations..."
    # Check if migration files exist
    if [ -d "backend/migrations" ]; then
        docker compose -f "$COMPOSE_FILE" run --rm backend npm run migrate || {
            echo "❌ Database migration failed"
            exit 1
        }
    else
        echo "ℹ️  No migration directory found, skipping migrations"
    fi
fi

# Start all services
echo "🚀 Starting all services..."
docker compose -f "$COMPOSE_FILE" up -d

# Wait for services to be healthy
echo "🔍 Checking service health..."
RETRIES=60
HEALTHY=false

while [ $RETRIES -gt 0 ]; do
    if docker compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy"; then
        echo "   Some services are unhealthy, waiting... ($RETRIES attempts remaining)"
        sleep 5
        RETRIES=$((RETRIES - 5))
    else
        echo "✅ All services are healthy"
        HEALTHY=true
        break
    fi
done

if [ "$HEALTHY" = false ]; then
    echo "❌ Some services failed health checks"
    echo "📋 Service status:"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "📋 Service logs:"
    docker compose -f "$COMPOSE_FILE" logs --tail=50
    exit 1
fi

# Verify deployment
echo "✅ Verifying deployment..."

# Test backend health
if curl -f -s "http://localhost:3001/health" >/dev/null; then
    echo "✅ Backend health check passed"
else
    echo "❌ Backend health check failed"
    exit 1
fi

# Test frontend
if curl -f -s "http://localhost/" >/dev/null; then
    echo "✅ Frontend health check passed"
else
    echo "❌ Frontend health check failed"
    exit 1
fi

# Show deployment summary
echo ""
echo "🎉 Deployment completed successfully!"
echo "📊 Deployment Summary:"
echo "   - Environment: $ENVIRONMENT"
echo "   - Services running: $(docker compose -f "$COMPOSE_FILE" ps --services | wc -l)"
echo "   - Frontend URL: http://localhost"
echo "   - Backend API: http://localhost:3001"
echo "   - Health Check: http://localhost:3001/health"

# Show running containers
echo ""
echo "📋 Running containers:"
docker compose -f "$COMPOSE_FILE" ps

# Optional: Run smoke tests
if [ -f "$SCRIPT_DIR/smoke-test.sh" ]; then
    echo ""
    echo "🧪 Running smoke tests..."
    "$SCRIPT_DIR/smoke-test.sh" || {
        echo "⚠️  Smoke tests failed, but deployment is complete"
    }
fi

echo ""
echo "✨ Deployment complete! TeamCache Manager is ready to use."