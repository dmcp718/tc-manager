#!/bin/sh
# Development entrypoint script that ensures npm packages are installed

set -e

# Check if node_modules exists and has content
if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
    echo "Installing npm packages..."
    npm ci
    echo "npm packages installed successfully"
else
    echo "node_modules already exists, skipping npm install"
fi

# Execute the original command
exec "$@"