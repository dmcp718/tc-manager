#!/bin/bash

# SiteCache Browser Automated Backup Script for Cron
# Add to crontab with: crontab -e
# Example: 0 2 * * * /path/to/sitecache-browser/scripts/backup-cron.sh

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Source environment variables if available
if [ -f "$PROJECT_DIR/.env.production" ]; then
    # Export variables from .env file
    export $(grep -v '^#' "$PROJECT_DIR/.env.production" | grep -v '^$' | xargs)
fi

# Configuration
BACKUP_DIR="${PROJECT_DIR}/backups"
LOG_FILE="${PROJECT_DIR}/logs/backup-cron.log"
MAX_LOG_SIZE=10485760  # 10MB

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

# Rotate log file if it's too large
if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null) -gt $MAX_LOG_SIZE ]; then
    mv "$LOG_FILE" "${LOG_FILE}.old"
fi

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting automated database backup..."

# Set environment for Docker if needed
export POSTGRES_USER="${POSTGRES_USER:-sitecache_user}"
export POSTGRES_DB="${POSTGRES_DB:-sitecache_db}"
export POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export BACKUP_DIR="$BACKUP_DIR"
export RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Run backup script
if "$SCRIPT_DIR/backup-database.sh" 2>&1 | while IFS= read -r line; do log "$line"; done; then
    log "Automated backup completed successfully"
    
    # Optional: Check disk space
    BACKUP_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1 || echo "unknown")
    log "Total backup directory size: $BACKUP_SIZE"
    
    # Optional: Upload to cloud storage (uncomment and configure)
    # log "Starting cloud backup upload..."
    # if rsync -av "$BACKUP_DIR/" user@backup-server:/backups/sitecache/; then
    #     log "Cloud backup upload successful"
    # else
    #     log "WARNING: Cloud backup upload failed"
    # fi
    
else
    log "ERROR: Automated backup failed"
    
    # Optional: Send alert notification (uncomment to enable)
    # if command -v mail >/dev/null 2>&1; then
    #     echo "SiteCache automated backup failed. Check logs at $LOG_FILE" | \
    #         mail -s "SiteCache Backup FAILED" admin@yourcompany.com
    # fi
    
    exit 1
fi

log "Automated backup process completed"