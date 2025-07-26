# Multi-stage Dockerfile for Media Preview Service
FROM ubuntu:22.04 AS base

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js, FFmpeg and LucidLink requirements
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    lsb-release \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends \
    nodejs \
    dumb-init \
    wget \
    fuse \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy and install custom LucidLink build (if available)
COPY lucidlink-builds/ /tmp/lucidlink-builds/
RUN if [ -f /tmp/lucidlink-builds/lucidlink_3.2.6817_amd64.deb ]; then \
        echo "Installing LucidLink package..." \
        && apt-get update \
        && apt-get install -y /tmp/lucidlink-builds/lucidlink_3.2.6817_amd64.deb \
        && rm -rf /tmp/lucidlink-builds \
        && rm -rf /var/lib/apt/lists/*; \
    else \
        echo "LucidLink package not found - will not be able to access LucidLink files" \
        && rm -rf /tmp/lucidlink-builds; \
    fi

# Enable FUSE user_allow_other option
RUN echo "user_allow_other" >> /etc/fuse.conf

# Set working directory
WORKDIR /app

# Production stage
FROM base AS production

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY sc-manager-greenfield/media-preview/package*.json ./

# Install production dependencies only
RUN npm ci --only=production --no-audit --no-fund

# Copy application files
COPY sc-manager-greenfield/media-preview/ .

# Make startup script executable
RUN chmod +x start-lucidlink.sh

# Create necessary directories
RUN mkdir -p /app/logs /app/preview-cache

# Expose port for media preview service
EXPOSE 3003

# Run as root (required for LucidLink FUSE mount access)
USER root

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/bin/dumb-init", "--", "./start-lucidlink.sh"]

# Start the media preview service
CMD ["node", "server.js"]