#!/bin/bash

# SiteCache Browser Database Backup Script
# Usage: ./backup-database.sh [backup-name]

set -euo pipefail

# Configuration from environment or defaults
POSTGRES_USER="${POSTGRES_USER:-sitecache_user}"
POSTGRES_DB="${POSTGRES_DB:-sitecache_db}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate backup filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="${1:-sitecache_backup_$TIMESTAMP}"
BACKUP_FILE="$BACKUP_DIR/${BACKUP_NAME}.sql"
BACKUP_COMPRESSED="$BACKUP_DIR/${BACKUP_NAME}.sql.gz"

echo "Starting database backup..."
echo "Database: $POSTGRES_DB"
echo "Host: $POSTGRES_HOST:$POSTGRES_PORT"
echo "User: $POSTGRES_USER"
echo "Backup file: $BACKUP_FILE"

# Check if PostgreSQL is accessible
if ! pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" >/dev/null 2>&1; then
    echo "Error: Cannot connect to PostgreSQL server at $POSTGRES_HOST:$POSTGRES_PORT"
    exit 1
fi

# Create database dump
echo "Creating database dump..."
if ! pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
    --no-password \
    --verbose \
    --format=plain \
    --no-owner \
    --no-privileges \
    "$POSTGRES_DB" > "$BACKUP_FILE"; then
    echo "Error: Failed to create database dump"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Compress the backup
echo "Compressing backup..."
if gzip "$BACKUP_FILE"; then
    echo "Backup compressed: $BACKUP_COMPRESSED"
    FINAL_BACKUP="$BACKUP_COMPRESSED"
else
    echo "Warning: Failed to compress backup, keeping uncompressed"
    FINAL_BACKUP="$BACKUP_FILE"
fi

# Get backup file size
BACKUP_SIZE=$(du -h "$FINAL_BACKUP" | cut -f1)
echo "Backup completed successfully!"
echo "File: $FINAL_BACKUP"
echo "Size: $BACKUP_SIZE"

# Clean up old backups
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "sitecache_backup_*.sql*" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

# Count remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "sitecache_backup_*.sql*" -type f | wc -l)
echo "Total backups retained: $BACKUP_COUNT"

# Verify backup integrity
echo "Verifying backup integrity..."
if [[ "$FINAL_BACKUP" == *.gz ]]; then
    if gunzip -t "$FINAL_BACKUP" 2>/dev/null; then
        echo "Backup integrity verified successfully"
    else
        echo "Warning: Backup integrity check failed"
        exit 1
    fi
else
    if head -n 1 "$FINAL_BACKUP" | grep -q "PostgreSQL database dump" 2>/dev/null; then
        echo "Backup integrity verified successfully"
    else
        echo "Warning: Backup integrity check failed"
        exit 1
    fi
fi

echo "Database backup process completed successfully!"

# Optional: Send notification (uncomment to enable)
# if command -v mail >/dev/null 2>&1; then
#     echo "Database backup completed: $FINAL_BACKUP ($BACKUP_SIZE)" | \
#         mail -s "SiteCache Database Backup Success" admin@yourcompany.com
# fi