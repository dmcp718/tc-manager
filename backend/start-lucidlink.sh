#!/bin/bash

# Function to start a LucidLink instance
start_lucidlink_instance() {
    local INSTANCE_NUM=$1
    local FILESPACE_VAR="LUCIDLINK_FILESPACE_${INSTANCE_NUM}"
    local USER_VAR="LUCIDLINK_USER_${INSTANCE_NUM}"
    local PASSWORD_VAR="LUCIDLINK_PASSWORD_${INSTANCE_NUM}"
    local MOUNT_POINT_VAR="LUCIDLINK_MOUNT_POINT_${INSTANCE_NUM}"
    local INSTANCE_VAR="LUCIDLINK_INSTANCE_${INSTANCE_NUM}"
    
    # Get values from environment variables
    local FILESPACE="${!FILESPACE_VAR}"
    local USER="${!USER_VAR}"
    local PASSWORD="${!PASSWORD_VAR}"
    local MOUNT_POINT="${!MOUNT_POINT_VAR}"
    local INSTANCE="${!INSTANCE_VAR}"
    
    # Check if all required variables are set
    if [ -n "$FILESPACE" ] && [ -n "$USER" ] && [ -n "$PASSWORD" ] && [ -n "$MOUNT_POINT" ]; then
        echo "Starting LucidLink daemon for Filespace $INSTANCE_NUM..."
        echo "Filespace: $FILESPACE"
        echo "Mount point: $MOUNT_POINT"
        echo "Instance ID: $INSTANCE"
        
        # Create LucidLink config directory as root
        mkdir -p /root/.lucid
        
        # Create mount point if it doesn't exist
        if [ ! -d "$MOUNT_POINT" ]; then
            mkdir -p "$MOUNT_POINT"
        fi
        
        # Start LucidLink daemon in background as root with specific instance ID
        echo "Starting LucidLink daemon as root with instance $INSTANCE..."
        lucid --instance "$INSTANCE" daemon \
            --fs "$FILESPACE" \
            --user "$USER" \
            --password "$PASSWORD" \
            --mount-point "$MOUNT_POINT" \
            --fuse-allow-other &
        
        # Wait a bit for daemon to start
        sleep 5
        
        # Configure LucidLink cache size for this instance
        echo "Configuring LucidLink cache size to 100MB for instance $INSTANCE..."
        lucid --instance "$INSTANCE" config --set --DataCache.Size 100MB
        
        # Check if mount was successful
        if mountpoint -q "$MOUNT_POINT"; then
            echo "LucidLink successfully mounted at $MOUNT_POINT"
            ls -la "$MOUNT_POINT"
        else
            echo "Warning: LucidLink mount may have failed for $MOUNT_POINT"
        fi
        
        return 0
    else
        return 1
    fi
}

# Start all configured LucidLink instances
echo "Checking for LucidLink configurations..."

# Try to start up to 5 filespaces (can be extended if needed)
STARTED_COUNT=0
for i in 1 2 3 4 5; do
    if start_lucidlink_instance $i; then
        STARTED_COUNT=$((STARTED_COUNT + 1))
    fi
done

# Fallback to legacy environment variables if no numbered configs found
if [ $STARTED_COUNT -eq 0 ]; then
    echo "No numbered LucidLink configurations found, checking legacy variables..."
    
    if [ -n "$LUCIDLINK_FILESPACE" ] && [ -n "$LUCIDLINK_USER" ] && [ -n "$LUCIDLINK_PASSWORD" ]; then
        echo "Starting LucidLink daemon (legacy mode)..."
        echo "Filespace: $LUCIDLINK_FILESPACE"
        echo "Mount point: $LUCIDLINK_MOUNT_POINT"
        
        # Create LucidLink config directory as root
        mkdir -p /root/.lucid
        
        # Create mount point if it doesn't exist
        if [ ! -d "$LUCIDLINK_MOUNT_POINT" ]; then
            mkdir -p "$LUCIDLINK_MOUNT_POINT"
        fi
        
        # Start LucidLink daemon in background as root with instance 2001
        echo "Starting LucidLink daemon as root with instance 2001..."
        lucid --instance 2001 daemon \
            --fs "$LUCIDLINK_FILESPACE" \
            --user "$LUCIDLINK_USER" \
            --password "$LUCIDLINK_PASSWORD" \
            --mount-point "$LUCIDLINK_MOUNT_POINT" \
            --fuse-allow-other &
        
        # Wait a bit for daemon to start
        sleep 5
        
        # Configure LucidLink cache size for instance 2001
        echo "Configuring LucidLink cache size to 100MB for instance 2001..."
        lucid --instance 2001 config --set --DataCache.Size 100MB
        
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
else
    echo "Started $STARTED_COUNT LucidLink instance(s)"
fi

# Start the main application as root (temporary fix)
echo "Starting Node.js application..."
cd /app
exec "$@"