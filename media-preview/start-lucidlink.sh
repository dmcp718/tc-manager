#!/bin/bash

# Media-preview service does not mount LucidLink directly
# Instead, it will access files through the backend API when needed
# This gives us the best performance:
# - Backend has restricted 100MB cache for general operations  
# - Media-preview processes videos with full system resources
# - No LucidLink instance conflicts

echo "Media Preview Service starting without LucidLink mount"
echo "Will access files through backend API for transcoding"

# Start the main application
echo "Starting Media Preview Service..."
cd /app
exec "$@"