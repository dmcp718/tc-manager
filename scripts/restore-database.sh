#!/bin/bash

# SiteCache Browser Database Restore Script
# Usage: ./restore-database.sh <backup-file>

set -euo pipefail

# Configuration from environment or defaults
POSTGRES_USER="${POSTGRES_USER:-sitecache_user}"
POSTGRES_DB="${POSTGRES_DB:-sitecache_db}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

# Check if backup file is provided
if [ $# -eq 0 ]; then
    echo "Error: No backup file specified"
    echo "Usage: $0 <backup-file>"
    echo "Example: $0 ./backups/sitecache_backup_20240715_143000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "Starting database restore..."
echo "Database: $POSTGRES_DB"
echo "Host: $POSTGRES_HOST:$POSTGRES_PORT"
echo "User: $POSTGRES_USER"
echo "Backup file: $BACKUP_FILE"

# Check if PostgreSQL is accessible
if ! pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" >/dev/null 2>&1; then
    echo "Error: Cannot connect to PostgreSQL server at $POSTGRES_HOST:$POSTGRES_PORT"
    exit 1
fi

# Confirm restoration
echo ""
echo "WARNING: This will COMPLETELY REPLACE the existing database!"
echo "All current data in '$POSTGRES_DB' will be lost."
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Create a backup of current database before restore
echo "Creating safety backup of current database..."
SAFETY_BACKUP="./safety_backup_$(date +%Y%m%d_%H%M%S).sql"
if pg_dump -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" \
    --no-password --format=plain --no-owner --no-privileges \
    "$POSTGRES_DB" > "$SAFETY_BACKUP" 2>/dev/null; then
    echo "Safety backup created: $SAFETY_BACKUP"
else
    echo "Warning: Could not create safety backup"
    read -p "Continue without safety backup? (yes/no): " continue_confirm
    if [ "$continue_confirm" != "yes" ]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# Drop existing database connections
echo "Terminating existing database connections..."
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || echo "Warning: Could not terminate all connections"

# Drop and recreate database
echo "Dropping and recreating database..."
psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $POSTGRES_DB;" \
    -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"

if [ $? -ne 0 ]; then
    echo "Error: Failed to recreate database"
    exit 1
fi

# Restore from backup
echo "Restoring from backup..."
if [[ "$BACKUP_FILE" == *.gz ]]; then
    # Compressed backup
    echo "Decompressing and restoring..."
    if gunzip -c "$BACKUP_FILE" | psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --quiet; then
        echo "Restore completed successfully!"
    else
        echo "Error: Restore failed"
        exit 1
    fi
else
    # Uncompressed backup
    echo "Restoring from uncompressed backup..."
    if psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --quiet < "$BACKUP_FILE"; then
        echo "Restore completed successfully!"
    else
        echo "Error: Restore failed"
        exit 1
    fi
fi

# Verify restore
echo "Verifying restore..."
TABLE_COUNT=$(psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "Verification successful: $TABLE_COUNT tables restored"
    
    # Show some basic statistics
    echo ""
    echo "Database statistics after restore:"
    psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -c "SELECT schemaname, tablename, n_tup_ins as inserts, n_tup_upd as updates, n_tup_del as deletes 
            FROM pg_stat_user_tables 
            ORDER BY tablename;" 2>/dev/null || echo "Could not retrieve statistics"
else
    echo "Warning: Verification failed - no tables found"
    exit 1
fi

# Clean up safety backup if restore was successful
if [ -f "$SAFETY_BACKUP" ]; then
    read -p "Delete safety backup? (yes/no): " delete_confirm
    if [ "$delete_confirm" = "yes" ]; then
        rm -f "$SAFETY_BACKUP"
        echo "Safety backup deleted"
    else
        echo "Safety backup retained: $SAFETY_BACKUP"
    fi
fi

echo ""
echo "Database restore process completed successfully!"
echo "Database '$POSTGRES_DB' has been restored from '$BACKUP_FILE'"

# Optional: Send notification (uncomment to enable)
# if command -v mail >/dev/null 2>&1; then
#     echo "Database restore completed from: $BACKUP_FILE" | \
#         mail -s "SiteCache Database Restore Success" admin@yourcompany.com
# fi