#!/bin/bash

# Start LucidLink daemon if credentials are provided
if [ -n "$LUCIDLINK_FILESPACE" ] && [ -n "$LUCIDLINK_USER" ] && [ -n "$LUCIDLINK_PASSWORD" ]; then
    echo "Starting LucidLink daemon..."
    echo "Filespace: $LUCIDLINK_FILESPACE"
    echo "Mount point: $LUCIDLINK_MOUNT_POINT"
    
    # Create LucidLink config directory as root
    mkdir -p /root/.lucid
    
    # Create mount point if it doesn't exist (should already exist from volume mount)
    if [ ! -d "$LUCIDLINK_MOUNT_POINT" ]; then
        mkdir -p "$LUCIDLINK_MOUNT_POINT"
    fi
    
    # Start LucidLink daemon in background as root
    echo "Starting LucidLink daemon as root..."
    lucid daemon \
        --fs "$LUCIDLINK_FILESPACE" \
        --user "$LUCIDLINK_USER" \
        --password "$LUCIDLINK_PASSWORD" \
        --mount-point "$LUCIDLINK_MOUNT_POINT" \
        --fuse-allow-other &
    
    # Wait a bit for daemon to start
    sleep 5
    
    # Configure LucidLink cache size
    echo "Configuring LucidLink cache size to 100MB..."
    lucid config --set --DataCache.Size 100MB
    
    # Check if mount was successful
    if mountpoint -q "$LUCIDLINK_MOUNT_POINT"; then
        echo "LucidLink successfully mounted at $LUCIDLINK_MOUNT_POINT"
        ls -la "$LUCIDLINK_MOUNT_POINT"
    else
        echo "Warning: LucidLink mount may have failed"
    fi
else
    echo "LucidLink credentials not provided, skipping daemon startup"
fi

# Start the main application as root (temporary fix)
echo "Starting Node.js application..."
cd /app
exec "$@"